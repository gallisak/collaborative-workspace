import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateKeyBetween } from 'fractional-indexing';
import type { Document } from '../../generated/prisma/client.js';
import { CollabEventsService } from '../../infra/collab-events/collab-events.service.js';
import { type Transaction, UnitOfWork } from '../../infra/prisma/unit-of-work.js';
import { DocumentAccessService } from '../permissions/document-access.service.js';
import type { DocumentAccess } from '../permissions/document-access.js';
import { PageRevalidationService } from '../publishing/page-revalidation.service.js';
import { WorkspaceAccessService } from '../permissions/workspace-access.service.js';
import { UsersService } from '../users/users.service.js';
import { assertCapacity } from '../workspaces/plan-limits.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type {
  CreateDocumentDto,
  DocumentDto,
  DocumentNodeDto,
  DocumentPermissionDto,
  MoveDocumentDto,
  ShareDocumentDto,
} from './documents.dto.js';
import { DocumentsRepository } from './documents.repository.js';
import { TreeCacheService } from './tree-cache.service.js';

const toDto = (document: Document, access: DocumentAccess): DocumentDto => ({
  id: document.id,
  workspaceId: document.workspaceId,
  parentId: document.parentId,
  title: document.title,
  access,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly documents: DocumentsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly documentAccess: DocumentAccessService,
    private readonly users: UsersService,
    private readonly treeCache: TreeCacheService,
    private readonly uow: UnitOfWork,
    private readonly collabEvents: CollabEventsService,
    private readonly pages: PageRevalidationService,
  ) {}

  async tree(userId: string, workspaceId: string): Promise<DocumentNodeDto[]> {
    await this.workspaceAccess.requireMember(workspaceId, userId);
    return this.treeCache.get(workspaceId, () => this.documents.listTree(workspaceId));
  }

  async get(userId: string, documentId: string): Promise<DocumentDto> {
    const { document, access } = await this.documentAccess.resolve(documentId, userId);
    return toDto(document, access);
  }

  async create(userId: string, workspaceId: string, dto: CreateDocumentDto): Promise<DocumentDto> {
    const parentId = dto.parentId ?? null;
    const document = await this.uow.run(async (tx) => {
      const workspace = await this.lockWorkspace(workspaceId, tx);
      await this.assertCanPlaceUnder(userId, workspaceId, parentId, tx);
      assertCapacity(
        {
          planName: workspace.plan.name,
          resource: 'documents',
          limit: workspace.plan.maxDocuments,
        },
        await this.documents.countActive(workspaceId, tx),
      );
      const position = await this.positionFor({ workspaceId, parentId }, dto.afterId, tx);
      return this.documents.create(
        { workspaceId, parentId, title: dto.title ?? '', position, createdById: userId },
        tx,
      );
    });
    await this.treeCache.invalidate(workspaceId);
    this.logger.log({ workspaceId, documentId: document.id, userId }, 'Document created');
    return this.get(userId, document.id);
  }

  async rename(userId: string, documentId: string, title: string): Promise<DocumentDto> {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    await this.documents.rename(documentId, title);
    await this.treeCache.invalidate(document.workspaceId);
    await this.pages.scheduleIfPublished([documentId]);
    return this.get(userId, documentId);
  }

  async move(userId: string, documentId: string, dto: MoveDocumentDto): Promise<DocumentDto> {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    const { workspaceId } = document;
    await this.uow.run(async (tx) => {
      await this.lockWorkspace(workspaceId, tx);
      if (!(await this.documents.findActive(documentId, tx))) {
        throw new NotFoundException('Document not found');
      }
      await this.assertCanPlaceUnder(userId, workspaceId, dto.parentId, tx);
      if (
        dto.parentId !== null &&
        (await this.documents.isSelfOrAncestor(documentId, dto.parentId, tx))
      ) {
        throw new BadRequestException('A document cannot be moved inside itself');
      }
      const position = await this.positionFor(
        { workspaceId, parentId: dto.parentId, excludeId: documentId },
        dto.afterId,
        tx,
      );
      await this.documents.move(documentId, dto.parentId, position, tx);
    });
    await this.treeCache.invalidate(workspaceId);
    await this.collabEvents.accessChanged(workspaceId);
    this.logger.log({ workspaceId, documentId, parentId: dto.parentId, userId }, 'Document moved');
    return this.get(userId, documentId);
  }

  async remove(userId: string, documentId: string) {
    const { document } = await this.documentAccess.require(documentId, userId, 'EDIT');
    const deleted = await this.uow.run(async (tx) => {
      await this.lockWorkspace(document.workspaceId, tx);
      return this.documents.softDeleteSubtree(documentId, new Date(), tx);
    });
    await this.treeCache.invalidate(document.workspaceId);
    await this.collabEvents.accessChanged(document.workspaceId);
    await this.pages.scheduleIfPublished(deleted);
    this.logger.log(
      { workspaceId: document.workspaceId, documentId, deleted: deleted.length, userId },
      'Document deleted',
    );
  }

  async listPermissions(userId: string, documentId: string): Promise<DocumentPermissionDto[]> {
    await this.documentAccess.require(documentId, userId, 'MANAGE');
    const permissions = await this.documents.listPermissions(documentId);
    return permissions.map((permission) => ({
      userId: permission.userId,
      email: permission.user.email,
      name: permission.user.name,
      accessLevel: permission.accessLevel,
    }));
  }

  async share(userId: string, documentId: string, dto: ShareDocumentDto) {
    const { document } = await this.documentAccess.require(documentId, userId, 'MANAGE');
    const target = await this.users.findByEmail(dto.email);
    if (!target) {
      throw new NotFoundException('No registered user with this email');
    }
    await this.documents.upsertPermission(documentId, target.id, dto.accessLevel, userId);
    await this.collabEvents.accessChanged(document.workspaceId);
    this.logger.log(
      { documentId, userId, targetUserId: target.id, accessLevel: dto.accessLevel },
      'Document shared',
    );
  }

  async unshare(userId: string, documentId: string, targetUserId: string) {
    const { document } = await this.documentAccess.require(documentId, userId, 'MANAGE');
    if (!(await this.documents.deletePermission(documentId, targetUserId))) {
      throw new NotFoundException('Permission not found');
    }
    await this.collabEvents.accessChanged(document.workspaceId);
  }

  private async assertCanPlaceUnder(
    userId: string,
    workspaceId: string,
    parentId: string | null,
    tx: Transaction,
  ) {
    if (parentId === null) {
      await this.workspaceAccess.requireRole(workspaceId, userId, 'EDITOR', tx);
      return;
    }
    const { document: parent } = await this.documentAccess.require(parentId, userId, 'EDIT', tx);
    if (parent.workspaceId !== workspaceId) {
      throw new BadRequestException('Parent document belongs to another workspace');
    }
  }

  private async positionFor(
    scope: { workspaceId: string; parentId: string | null; excludeId?: string },
    afterId: string | null | undefined,
    tx: Transaction,
  ) {
    if (afterId === undefined) {
      return generateKeyBetween(await this.documents.lastPosition(scope, tx), null);
    }
    let after: string | null = null;
    if (afterId !== null) {
      const sibling = await this.documents.findActive(afterId, tx);
      if (
        !sibling ||
        sibling.id === scope.excludeId ||
        sibling.workspaceId !== scope.workspaceId ||
        sibling.parentId !== scope.parentId
      ) {
        throw new BadRequestException('afterId must be a sibling under the target parent');
      }
      after = sibling.position;
    }
    return generateKeyBetween(after, await this.documents.nextPosition(scope, after, tx));
  }

  private async lockWorkspace(workspaceId: string, tx: Transaction) {
    const workspace = await this.workspaces.lockWithPlan(workspaceId, tx);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }
}
