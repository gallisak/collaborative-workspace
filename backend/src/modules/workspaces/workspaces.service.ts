import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CollabEventsService } from '../../infra/collab-events/collab-events.service.js';
import { UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { WorkspaceAccessService } from '../permissions/workspace-access.service.js';
import type { WorkspaceDetailsDto, WorkspaceSummaryDto } from './workspaces.dto.js';
import { WorkspacesRepository } from './workspaces.repository.js';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly access: WorkspaceAccessService,
    private readonly uow: UnitOfWork,
    private readonly collabEvents: CollabEventsService,
  ) {}

  async create(userId: string, name: string): Promise<WorkspaceSummaryDto> {
    const workspace = await this.uow.run((tx) => this.workspaces.createWithOwner(name, userId, tx));
    this.logger.log({ workspaceId: workspace.id, userId }, 'Workspace created');
    return { id: workspace.id, name: workspace.name, planId: workspace.planId, role: 'OWNER' };
  }

  async listForUser(userId: string): Promise<WorkspaceSummaryDto[]> {
    const memberships = await this.workspaces.findMemberships(userId);
    return memberships.map(({ workspace, role }) => ({
      id: workspace.id,
      name: workspace.name,
      planId: workspace.planId,
      role,
    }));
  }

  async get(userId: string, workspaceId: string): Promise<WorkspaceDetailsDto> {
    const role = await this.access.requireMember(workspaceId, userId);
    const workspace = await this.workspaces.findWithPlan(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const { plan } = workspace;
    return {
      id: workspace.id,
      name: workspace.name,
      role,
      plan: {
        id: plan.id,
        name: plan.name,
        maxMembers: plan.maxMembers,
        maxDocuments: plan.maxDocuments,
        maxStorageBytes: plan.maxStorageBytes === null ? null : Number(plan.maxStorageBytes),
      },
      memberCount: workspace._count.members,
    };
  }

  async rename(userId: string, workspaceId: string, name: string) {
    await this.access.requireRole(workspaceId, userId, 'ADMIN');
    await this.workspaces.rename(workspaceId, name);
    return this.get(userId, workspaceId);
  }

  async remove(userId: string, workspaceId: string) {
    await this.access.requireRole(workspaceId, userId, 'OWNER');
    await this.workspaces.delete(workspaceId);
    await this.collabEvents.accessChanged(workspaceId);
    this.logger.log({ workspaceId, userId }, 'Workspace deleted');
  }
}
