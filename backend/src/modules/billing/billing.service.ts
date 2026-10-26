import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { durationToSeconds } from '../../common/duration.js';
import type { CheckoutSession, Plan } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.schema.js';
import { AttachmentsRepository } from '../attachments/attachments.repository.js';
import { WorkspaceAccessService } from '../permissions/workspace-access.service.js';
import type {
  CheckoutSessionDto,
  CreateCheckoutDto,
  PlanDto,
  WorkspaceBillingDto,
} from './billing.dto.js';
import { BillingRepository } from './billing.repository.js';

export const toPlanDto = (plan: Plan): PlanDto => ({
  id: plan.id,
  name: plan.name,
  priceMinor: plan.priceMinor,
  maxMembers: plan.maxMembers,
  maxDocuments: plan.maxDocuments,
  maxStorageBytes: plan.maxStorageBytes === null ? null : Number(plan.maxStorageBytes),
});

export const isCheckoutOpen = (session: CheckoutSession, now: Date) =>
  session.status === 'OPEN' && session.expiresAt > now;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly checkoutTtlMs: number;
  private readonly frontendUrl: string;

  constructor(
    private readonly billing: BillingRepository,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly attachments: AttachmentsRepository,
    config: ConfigService<Env, true>,
  ) {
    this.checkoutTtlMs =
      durationToSeconds(config.get('CHECKOUT_SESSION_TTL', { infer: true })) * 1000;
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
  }

  async plans(): Promise<PlanDto[]> {
    return (await this.billing.listPlans()).map(toPlanDto);
  }

  async overview(userId: string, workspaceId: string): Promise<WorkspaceBillingDto> {
    await this.workspaceAccess.requireMember(workspaceId, userId);
    const [workspace, storageBytes] = await Promise.all([
      this.billing.findWorkspace(workspaceId),
      this.attachments.uploadedBytes(workspaceId),
    ]);
    return {
      plan: toPlanDto(workspace.plan),
      subscription: workspace.subscription,
      usage: {
        members: workspace._count.members,
        pendingInvitations: workspace._count.invitations,
        documents: workspace._count.documents,
        storageBytes: Number(storageBytes),
      },
    };
  }

  async createCheckout(
    userId: string,
    workspaceId: string,
    dto: CreateCheckoutDto,
  ): Promise<CheckoutSessionDto> {
    await this.workspaceAccess.requireRole(workspaceId, userId, 'ADMIN');
    const workspace = await this.billing.findWorkspace(workspaceId);
    if (workspace.planId === dto.planId) {
      throw new BadRequestException(`The workspace is already on the ${workspace.plan.name} plan`);
    }
    const plan = await this.billing.findPlan(dto.planId);
    const members = workspace._count.members;
    if (plan.maxMembers !== null && members > plan.maxMembers) {
      throw new ConflictException(
        `The ${plan.name} plan allows up to ${plan.maxMembers} members, the workspace has ${members}. Remove members first.`,
      );
    }
    const session = await this.billing.createCheckout({
      workspaceId,
      planId: dto.planId,
      createdById: userId,
      expiresAt: new Date(Date.now() + this.checkoutTtlMs),
    });
    this.logger.log(
      { workspaceId, checkoutSessionId: session.id, planId: dto.planId, userId },
      'Checkout started',
    );
    return this.toDto(session);
  }

  async checkout(userId: string, sessionId: string): Promise<CheckoutSessionDto> {
    const session = await this.findCheckout(userId, sessionId);
    return this.toDto(session);
  }

  async findCheckout(userId: string, sessionId: string) {
    const session = await this.billing.findCheckout(sessionId);
    if (!session) {
      throw new NotFoundException('Checkout session not found');
    }
    await this.workspaceAccess
      .requireRole(session.workspaceId, userId, 'ADMIN')
      .catch(() => Promise.reject(new NotFoundException('Checkout session not found')));
    return session;
  }

  private toDto(session: CheckoutSession & { plan: Plan }): CheckoutSessionDto {
    const expired = session.status === 'OPEN' && !isCheckoutOpen(session, new Date());
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      plan: toPlanDto(session.plan),
      status: expired ? 'EXPIRED' : session.status,
      expiresAt: session.expiresAt,
      url: new URL(`/billing/checkout/${session.id}`, this.frontendUrl).toString(),
    };
  }
}
