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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import {
  CommentDto,
  CreateCommentDto,
  CreateThreadDto,
  ThreadDto,
  UpdateThreadDto,
} from './comments.dto.js';
import { CommentsService } from './comments.service.js';

@ApiTags('comments')
@ApiNotFoundResponse({ description: 'Document does not exist or you have no access' })
@Controller('documents/:documentId/threads')
export class DocumentThreadsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOkResponse({ type: [ThreadDto] })
  list(@CurrentUser() user: AuthUser, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.comments.listThreads(user.id, documentId);
  }

  @Post()
  @ApiCreatedResponse({ type: ThreadDto })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  @ApiBadRequestResponse({ description: 'A mentioned user has no access to the document' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: CreateThreadDto,
  ) {
    return this.comments.createThread(user.id, documentId, dto);
  }
}

@ApiTags('comments')
@ApiNotFoundResponse({ description: 'Thread or comment does not exist, or you have no access' })
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post('threads/:threadId/comments')
  @ApiCreatedResponse({ type: CommentDto })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  @ApiBadRequestResponse({ description: 'A mentioned user has no access to the document' })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.reply(user.id, threadId, dto);
  }

  @Patch('threads/:threadId')
  @ApiOkResponse({ type: ThreadDto })
  @ApiForbiddenResponse({ description: 'Requires edit access' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() dto: UpdateThreadDto,
  ) {
    return this.comments.setResolved(user.id, threadId, dto.resolved);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Only the author or a document manager can delete' })
  remove(@CurrentUser() user: AuthUser, @Param('commentId', ParseUUIDPipe) commentId: string) {
    return this.comments.deleteComment(user.id, commentId);
  }
}
