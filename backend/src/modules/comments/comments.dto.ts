import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCommentDto {
  @ApiProperty({ example: 'Can you check this, @Bob?', maxLength: 5000 })
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 20,
    description: 'Users mentioned in the body, they must have access to the document',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mentionedUserIds?: string[];
}

export class CreateThreadDto extends CreateCommentDto {
  @ApiProperty({ example: 'b3f1c2d4', maxLength: 64, description: 'Id of the commented block' })
  @IsString()
  @Matches(/^[\w-]{1,64}$/)
  blockId: string;
}

export class UpdateThreadDto {
  @ApiProperty()
  @IsBoolean()
  resolved: boolean;
}

export class CommentUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  threadId: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: CommentUserDto, nullable: true })
  author: CommentUserDto | null;

  @ApiProperty({ type: [CommentUserDto] })
  mentions: CommentUserDto[];

  @ApiProperty()
  createdAt: Date;
}

export class ThreadDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty()
  blockId: string;

  @ApiProperty({ nullable: true, type: Date })
  resolvedAt: Date | null;

  @ApiProperty({ type: CommentUserDto, nullable: true })
  resolvedBy: CommentUserDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [CommentDto] })
  comments: CommentDto[];
}
