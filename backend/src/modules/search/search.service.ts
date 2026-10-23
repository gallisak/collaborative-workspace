import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceAccessService } from '../permissions/workspace-access.service.js';
import type { SearchHitDto } from './search.dto.js';
import { SearchRepository } from './search.repository.js';
import { prefixQuery } from './search-query.js';

@Injectable()
export class SearchService {
  constructor(
    private readonly search: SearchRepository,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async query(
    userId: string,
    workspaceId: string,
    text: string,
    limit: number,
  ): Promise<SearchHitDto[]> {
    const isMember = (await this.workspaceAccess.roleOf(workspaceId, userId)) !== null;
    if (!isMember && !(await this.search.hasSharedDocuments(workspaceId, userId))) {
      throw new NotFoundException('Workspace not found');
    }
    const query = prefixQuery(text);
    return query ? this.search.search({ workspaceId, userId, isMember }, query, limit) : [];
  }
}
