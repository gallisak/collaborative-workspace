import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';
import { PlanTier, WorkspaceRole } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const ASSIGNABLE_ROLES = [
  WorkspaceRole.ADMIN,
  WorkspaceRole.EDITOR,
  WorkspaceRole.VIEWER,
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Product team' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

export class UpdateWorkspaceDto extends CreateWorkspaceDto {}

export class WorkspaceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: PlanTier, enumName: 'PlanTier' })
  planId: PlanTier;

  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' })
  role: WorkspaceRole;
}

export class PlanDto {
  @ApiProperty({ enum: PlanTier, enumName: 'PlanTier' })
  id: PlanTier;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true, type: Number, description: 'null means unlimited' })
  maxMembers: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'null means unlimited' })
  maxDocuments: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'null means unlimited' })
  maxStorageBytes: number | null;
}

export class WorkspaceDetailsDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' })
  role: WorkspaceRole;

  @ApiProperty({ type: PlanDto })
  plan: PlanDto;

  @ApiProperty()
  memberCount: number;
}

export class MemberDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' })
  role: WorkspaceRole;

  @ApiProperty()
  joinedAt: Date;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;
}

export class CreateInvitationDto {
  @ApiProperty({ example: 'bob@collab.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;
}

export class InvitationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: WorkspaceRole, enumName: 'WorkspaceRole' })
  role: WorkspaceRole;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  createdAt: Date;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @Length(16, 256)
  token: string;
}

export class AcceptedInvitationDto {
  @ApiProperty({ format: 'uuid' })
  workspaceId: string;
}
