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
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiPaymentRequiredResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser, OptionalAuth, OptionalUser } from '../../common/auth/decorators.js';
import { AttachmentDto, CreateAttachmentDto, CreatedAttachmentDto } from './attachments.dto.js';
import { AttachmentsService } from './attachments.service.js';

@ApiTags('attachments')
@ApiNotFoundResponse({
  description: 'Document or attachment does not exist, or you have no access',
})
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('documents/:documentId/attachments')
  @ApiCreatedResponse({
    type: CreatedAttachmentDto,
    description: 'Upload the file with a POST to the presigned URL, then complete it',
  })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  @ApiPaymentRequiredResponse({ description: 'Storage limit of the plan is reached' })
  @ApiPayloadTooLargeResponse({ description: 'File is larger than allowed' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateAttachmentDto,
  ) {
    return this.attachments.create(user.id, documentId, dto);
  }

  @Post('attachments/:attachmentId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AttachmentDto })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachments.complete(user.id, attachmentId);
  }

  @Delete('attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachments.remove(user.id, attachmentId);
  }

  @OptionalAuth()
  @Get('attachments/:attachmentId/content')
  @ApiFoundResponse({
    description: 'Redirects to a short-lived presigned URL; public for published documents',
  })
  async content(
    @OptionalUser() user: AuthUser | undefined,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { url, maxAgeSeconds } = await this.attachments.downloadUrl(user?.id, attachmentId);
    res.set('Cache-Control', `private, max-age=${maxAgeSeconds}`);
    res.redirect(HttpStatus.FOUND, url);
  }
}
