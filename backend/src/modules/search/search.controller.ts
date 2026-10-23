import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { SearchHitDto, SearchQueryDto } from './search.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@Controller('workspaces/:workspaceId/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOkResponse({ type: [SearchHitDto], description: 'Only documents you can open' })
  @ApiNotFoundResponse({ description: 'Workspace does not exist or you have no access' })
  query(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() dto: SearchQueryDto,
  ) {
    return this.search.query(user.id, workspaceId, dto.q, dto.limit);
  }
}
