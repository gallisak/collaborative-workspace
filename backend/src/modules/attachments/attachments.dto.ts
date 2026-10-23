import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsPositive, IsString, Length } from 'class-validator';
import { AttachmentStatus } from '../../generated/prisma/enums.js';
import { IMAGE_TYPES } from './attachment-rules.js';

export class CreateAttachmentDto {
  @ApiProperty({ example: 'diagram.png', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  fileName: string;

  @ApiProperty({ enum: IMAGE_TYPES })
  @IsIn(IMAGE_TYPES)
  contentType: (typeof IMAGE_TYPES)[number];

  @ApiProperty({ example: 204800, description: 'Exact size of the file in bytes' })
  @IsInt()
  @IsPositive()
  sizeBytes: number;
}

export class AttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  documentId: string | null;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  contentType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ enum: AttachmentStatus, enumName: 'AttachmentStatus' })
  status: AttachmentStatus;

  @ApiProperty({ description: 'Stable URL to use as the image source in the document' })
  url: string;
}

export class UploadTargetDto {
  @ApiProperty({ description: 'Send a multipart/form-data POST here' })
  url: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Form fields to send before the file field named "file"',
  })
  fields: Record<string, string>;

  @ApiProperty()
  expiresAt: Date;
}

export class CreatedAttachmentDto {
  @ApiProperty({ type: AttachmentDto })
  attachment: AttachmentDto;

  @ApiProperty({ type: UploadTargetDto })
  upload: UploadTargetDto;
}
