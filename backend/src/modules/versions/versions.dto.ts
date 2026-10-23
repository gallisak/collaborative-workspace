import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';
import { VersionKind } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateVersionDto {
  @ApiPropertyOptional({ example: 'Before review', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name?: string;
}

export class VersionAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class VersionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: VersionKind, enumName: 'VersionKind' })
  kind: VersionKind;

  @ApiProperty({ nullable: true, type: String })
  name: string | null;

  @ApiProperty({ type: VersionAuthorDto, nullable: true })
  createdBy: VersionAuthorDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class VersionDetailsDto extends VersionDto {
  @ApiProperty({ description: 'Yjs state of the document at this version, base64 encoded' })
  state: string;
}
