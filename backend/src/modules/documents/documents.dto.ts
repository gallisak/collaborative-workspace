import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { AccessLevel } from '../../generated/prisma/enums.js';
import type { DocumentAccess } from '../permissions/document-access.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateDocumentDto {
  @ApiPropertyOptional({ example: 'Roadmap', maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Omit or null for root' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Sibling to place after; null puts it first, omitted puts it last',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  afterId?: string | null;
}

export class UpdateDocumentDto {
  @ApiProperty({ example: 'Roadmap Q4', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title: string;
}

export class MoveDocumentDto {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'null moves to the root' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Sibling to place after; null puts it first, omitted puts it last',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  afterId?: string | null;
}

export class DocumentNodeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Fractional index, sort siblings by it as plain strings' })
  position: string;
}

export class DocumentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ['VIEW', 'EDIT', 'MANAGE'] })
  access: DocumentAccess;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ShareDocumentDto {
  @ApiProperty({ example: 'bob@collab.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ enum: AccessLevel, enumName: 'AccessLevel' })
  @IsIn(Object.values(AccessLevel))
  accessLevel: AccessLevel;
}

export class DocumentPermissionDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AccessLevel, enumName: 'AccessLevel' })
  accessLevel: AccessLevel;
}
