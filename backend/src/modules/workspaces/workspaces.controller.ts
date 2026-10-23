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
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import {
  AcceptedInvitationDto,
  AcceptInvitationDto,
  CreateInvitationDto,
  CreateWorkspaceDto,
  InvitationDto,
  MemberDto,
  UpdateMemberRoleDto,
  UpdateWorkspaceDto,
  WorkspaceDetailsDto,
  WorkspaceSummaryDto,
} from './workspaces.dto.js';
import { WorkspacesService } from './workspaces.service.js';

const id = () => Param('workspaceId', ParseUUIDPipe);

@ApiTags('workspaces')
@ApiNotFoundResponse({ description: 'Workspace does not exist or you are not a member' })
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: WorkspaceSummaryDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, dto.name);
  }

  @Get()
  @ApiOkResponse({ type: [WorkspaceSummaryDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Get(':workspaceId')
  @ApiOkResponse({ type: WorkspaceDetailsDto })
  get(@CurrentUser() user: AuthUser, @id() workspaceId: string) {
    return this.workspaces.get(user.id, workspaceId);
  }

  @Patch(':workspaceId')
  @ApiOkResponse({ type: WorkspaceDetailsDto })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  rename(
    @CurrentUser() user: AuthUser,
    @id() workspaceId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.rename(user.id, workspaceId, dto.name);
  }

  @Delete(':workspaceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Requires owner role' })
  remove(@CurrentUser() user: AuthUser, @id() workspaceId: string) {
    return this.workspaces.remove(user.id, workspaceId);
  }

  @Get(':workspaceId/members')
  @ApiOkResponse({ type: [MemberDto] })
  listMembers(@CurrentUser() user: AuthUser, @id() workspaceId: string) {
    return this.members.list(user.id, workspaceId);
  }

  @Patch(':workspaceId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Role hierarchy does not allow this change' })
  changeRole(
    @CurrentUser() user: AuthUser,
    @id() workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.changeRole(user.id, workspaceId, targetUserId, dto.role);
  }

  @Delete(':workspaceId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Member removed, or you left the workspace' })
  @ApiForbiddenResponse({ description: 'Role hierarchy does not allow this removal' })
  removeMember(
    @CurrentUser() user: AuthUser,
    @id() workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.members.remove(user.id, workspaceId, targetUserId);
  }

  @Get(':workspaceId/invitations')
  @ApiOkResponse({ type: [InvitationDto] })
  @ApiForbiddenResponse({ description: 'Requires admin role' })
  listInvitations(@CurrentUser() user: AuthUser, @id() workspaceId: string) {
    return this.invitations.list(user.id, workspaceId);
  }

  @Post(':workspaceId/invitations')
  @ApiCreatedResponse({ type: InvitationDto })
  @ApiForbiddenResponse({ description: 'Role hierarchy does not allow inviting with this role' })
  @ApiPaymentRequiredResponse({ description: 'Member limit of the plan is reached' })
  invite(
    @CurrentUser() user: AuthUser,
    @id() workspaceId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(user.id, workspaceId, dto.email, dto.role);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  revokeInvitation(
    @CurrentUser() user: AuthUser,
    @id() workspaceId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitations.revoke(user.id, workspaceId, invitationId);
  }
}

@ApiTags('workspaces')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcceptedInvitationDto })
  @ApiPaymentRequiredResponse({ description: 'Member limit of the plan is reached' })
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(user.id, dto.token);
  }
}
