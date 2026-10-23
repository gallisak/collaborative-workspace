import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { durationToSeconds } from '../../common/duration.js';
import type { Env } from '../../infra/config/env.schema.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { UsersService } from '../users/users.service.js';
import { WorkspaceAccessService } from '../permissions/workspace-access.service.js';
import { canAssignRole, canManageMembers } from '../permissions/workspace-roles.js';
import { InvitationsRepository } from './invitations.repository.js';
import { assertCapacity } from './plan-limits.js';
import type { AssignableRole, InvitationDto } from './workspaces.dto.js';
import { WorkspacesRepository } from './workspaces.repository.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const toDto = (invitation: InvitationDto): InvitationDto => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly ttlSeconds: number;
  private readonly frontendUrl: string;

  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly access: WorkspaceAccessService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly uow: UnitOfWork,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = durationToSeconds(config.get('INVITATION_TTL', { infer: true }));
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
  }

  async list(userId: string, workspaceId: string): Promise<InvitationDto[]> {
    await this.access.requireRole(workspaceId, userId, 'ADMIN');
    const invitations = await this.invitations.listPending(workspaceId, new Date());
    return invitations.map(toDto);
  }

  async create(
    actorId: string,
    workspaceId: string,
    email: string,
    role: AssignableRole,
  ): Promise<InvitationDto> {
    const token = randomBytes(32).toString('base64url');
    const { invitation, workspaceName } = await this.uow.run(async (tx) => {
      const workspace = await this.lockWorkspace(workspaceId, tx);
      const actorRole = await this.access.requireMember(workspaceId, actorId, tx);
      if (!canAssignRole(actorRole, role)) {
        throw new ForbiddenException(`You cannot invite members with the ${role} role`);
      }
      if (await this.workspaces.isMemberByEmail(workspaceId, email, tx)) {
        throw new ConflictException('This user is already a member of the workspace');
      }

      const now = new Date();
      await this.invitations.revokeOpenForEmail(workspaceId, email, now, tx);
      const used =
        (await this.workspaces.countMembers(workspaceId, tx)) +
        (await this.invitations.countPending(workspaceId, now, tx));
      assertCapacity(this.memberLimit(workspace.plan), used);

      const created = await this.invitations.create(
        {
          workspaceId,
          email,
          role,
          tokenHash: hashToken(token),
          invitedById: actorId,
          expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
        },
        tx,
      );
      return { invitation: created, workspaceName: workspace.name };
    });

    const link = new URL('/invitations/accept', this.frontendUrl);
    link.searchParams.set('token', token);
    this.mail.send({
      to: email,
      subject: `You are invited to ${workspaceName}`,
      link: link.toString(),
    });
    this.logger.log({ workspaceId, actorId, invitationId: invitation.id, role }, 'Member invited');
    return toDto(invitation);
  }

  async revoke(actorId: string, workspaceId: string, invitationId: string) {
    const role = await this.access.requireMember(workspaceId, actorId);
    if (!canManageMembers(role)) {
      throw new ForbiddenException('Requires admin role in this workspace');
    }
    if (!(await this.invitations.revoke(workspaceId, invitationId, new Date()))) {
      throw new NotFoundException('Invitation not found');
    }
  }

  async accept(userId: string, token: string): Promise<{ workspaceId: string }> {
    const invitation = await this.invitations.findByTokenHash(hashToken(token));
    const user = await this.users.findById(userId);
    if (!invitation || !user) {
      throw new BadRequestException('Invitation is invalid or has expired');
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    const { workspaceId } = invitation;
    await this.uow.run(async (tx) => {
      const workspace = await this.lockWorkspace(workspaceId, tx);
      if (!(await this.invitations.markAccepted(invitation.id, new Date(), tx))) {
        throw new BadRequestException('Invitation is invalid or has expired');
      }
      if (await this.workspaces.findMember(workspaceId, userId, tx)) {
        return;
      }
      assertCapacity(
        this.memberLimit(workspace.plan),
        await this.workspaces.countMembers(workspaceId, tx),
      );
      await this.workspaces.addMember(workspaceId, userId, invitation.role, tx);
    });

    this.logger.log({ workspaceId, userId, invitationId: invitation.id }, 'Invitation accepted');
    return { workspaceId };
  }

  private memberLimit(plan: { name: string; maxMembers: number | null }) {
    return { planName: plan.name, resource: 'members', limit: plan.maxMembers };
  }

  private async lockWorkspace(workspaceId: string, tx: Transaction) {
    const workspace = await this.workspaces.lockWithPlan(workspaceId, tx);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }
}
