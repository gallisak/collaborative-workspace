import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { PublicDocumentsService } from './public-documents.service.js';
import { CreateShareLinkDto, PublicDocumentDto, ShareLinkDto } from './publishing.dto.js';
import { ShareLinksService } from './share-links.service.js';

@ApiTags('publishing')
@ApiNotFoundResponse({ description: 'Document or link does not exist, or you have no access' })
@ApiForbiddenResponse({ description: 'Requires manage access to the document' })
@Controller()
export class ShareLinksController {
  constructor(private readonly links: ShareLinksService) {}

  @Post('documents/:documentId/share-links')
  @ApiCreatedResponse({ type: ShareLinkDto })
  @ApiBadRequestResponse({ description: 'Expiry is in the past' })
  @ApiTooManyRequestsResponse({ description: 'Too many links created, try again later' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.links.create(user.id, documentId, dto);
  }

  @Get('documents/:documentId/share-links')
  @ApiOkResponse({ type: [ShareLinkDto] })
  list(@CurrentUser() user: AuthUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.links.list(user.id, documentId);
  }

  @Delete('share-links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  revoke(@CurrentUser() user: AuthUser, @Param('linkId', ParseUUIDPipe) linkId: string) {
    return this.links.revoke(user.id, linkId);
  }
}

@ApiTags('publishing')
@Public()
@Controller('public/documents')
export class PublicDocumentsController {
  constructor(private readonly documents: PublicDocumentsService) {}

  @Get(':token')
  @ApiOkResponse({ type: PublicDocumentDto })
  @ApiNotFoundResponse({ description: 'Link does not exist, expired or was revoked' })
  get(@Param('token') token: string) {
    return this.documents.get(token);
  }
}
