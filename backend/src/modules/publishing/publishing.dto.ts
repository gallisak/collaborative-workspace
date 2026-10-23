import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { AccessLevel } from '../../generated/prisma/enums.js';
import type { PublicBlock } from './public-content.js';

export class CreateShareLinkDto {
  @ApiProperty({ enum: AccessLevel, enumName: 'AccessLevel' })
  @IsEnum(AccessLevel)
  accessLevel: AccessLevel;

  @ApiPropertyOptional({ format: 'date-time', description: 'Omit for a link without expiry' })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}

export class ShareLinkDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Secret part of the public URL' })
  token: string;

  @ApiProperty({ enum: AccessLevel, enumName: 'AccessLevel' })
  accessLevel: AccessLevel;

  @ApiProperty({ nullable: true, type: Date })
  expiresAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class PublicDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'Plain text summary for SEO meta tags' })
  description: string;

  @ApiProperty({ enum: AccessLevel, enumName: 'AccessLevel' })
  accessLevel: AccessLevel;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Sanitized blocks: only known types, attributes and safe URLs',
  })
  blocks: PublicBlock[];
}
