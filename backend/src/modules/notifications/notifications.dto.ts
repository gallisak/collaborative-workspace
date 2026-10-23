import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { NotificationType } from '../../generated/prisma/enums.js';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Return notifications older than this one' })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}

export class NotificationActorDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class NotificationDocumentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId: string;

  @ApiProperty()
  title: string;
}

export class NotificationCommentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  threadId: string;

  @ApiProperty({ description: 'Beginning of the comment text' })
  excerpt: string;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  type: NotificationType;

  @ApiProperty({ type: NotificationActorDto, nullable: true })
  actor: NotificationActorDto | null;

  @ApiProperty({ type: NotificationDocumentDto, nullable: true })
  document: NotificationDocumentDto | null;

  @ApiProperty({ type: NotificationCommentDto, nullable: true })
  comment: NotificationCommentDto | null;

  @ApiProperty({ nullable: true, type: Date })
  readAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class UnreadCountDto {
  @ApiProperty()
  count: number;
}
