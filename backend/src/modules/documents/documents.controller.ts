import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPaymentRequiredResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import {
  CreateDocumentDto,
  DocumentDto,
  DocumentNodeDto,
  DocumentPermissionDto,
  MoveDocumentDto,
  ShareDocumentDto,
  UpdateDocumentDto,
} from './documents.dto.js';
import { DocumentsService } from './documents.service.js';

@ApiTags('documents')
@ApiNotFoundResponse({ description: 'Workspace does not exist or you are not a member' })
@Controller('workspaces/:workspaceId/documents')
export class WorkspaceDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOkResponse({ type: [DocumentNodeDto] })
  tree(@CurrentUser() user: AuthUser, @Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.documents.tree(user.id, workspaceId);
  }

  @Post()
  @ApiCreatedResponse({ type: DocumentDto })
  @ApiForbiddenResponse({ description: 'Requires edit access to the parent or editor role' })
  @ApiPaymentRequiredResponse({ description: 'Document limit of the plan is reached' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documents.create(user.id, workspaceId, dto);
  }
}

@ApiTags('documents')
@ApiNotFoundResponse({ description: 'Document does not exist or you have no access' })
@Controller('documents/:documentId')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOkResponse({ type: DocumentDto })
  get(@CurrentUser() user: AuthUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.documents.get(user.id, documentId);
  }

  @Patch()
  @ApiOkResponse({ type: DocumentDto })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  rename(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.rename(user.id, documentId, dto.title);
  }

  @Post('move')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DocumentDto })
  @ApiBadRequestResponse({ description: 'Target is the document itself or its descendant' })
  @ApiForbiddenResponse({ description: 'Requires edit access to the document and the target' })
  move(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: MoveDocumentDto,
  ) {
    return this.documents.move(user.id, documentId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The document and its subpages are deleted' })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  remove(@CurrentUser() user: AuthUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.documents.remove(user.id, documentId);
  }

  @Get('permissions')
  @ApiOkResponse({ type: [DocumentPermissionDto] })
  @ApiForbiddenResponse({ description: 'Requires full access' })
  listPermissions(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.documents.listPermissions(user.id, documentId);
  }

  @Put('permissions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Access granted or updated' })
  @ApiForbiddenResponse({ description: 'Requires full access' })
  share(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ShareDocumentDto,
  ) {
    return this.documents.share(user.id, documentId, dto);
  }

  @Delete('permissions/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Requires full access' })
  unshare(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.documents.unshare(user.id, documentId, targetUserId);
  }
}
