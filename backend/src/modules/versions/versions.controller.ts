import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { CreateVersionDto, VersionDetailsDto, VersionDto } from './versions.dto.js';
import { VersionsService } from './versions.service.js';

@ApiTags('versions')
@ApiNotFoundResponse({ description: 'Document or version does not exist, or you have no access' })
@Controller('documents/:documentId/versions')
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Get()
  @ApiOkResponse({ type: [VersionDto] })
  list(@CurrentUser() user: AuthUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.versions.list(user.id, documentId);
  }

  @Get(':versionId')
  @ApiOkResponse({ type: VersionDetailsDto })
  get(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.versions.get(user.id, documentId, versionId);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'The collaboration server saves the current state' })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateVersionDto,
  ) {
    return this.versions.create(user.id, documentId, dto.name);
  }

  @Post(':versionId/restore')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'The collaboration server applies the version as a new change for everyone',
  })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  restore(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.versions.restore(user.id, documentId, versionId);
  }
}
