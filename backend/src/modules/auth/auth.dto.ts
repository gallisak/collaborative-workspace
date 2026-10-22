import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { PublicUser } from '../users/user.dto.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @ApiProperty({ example: 'ann@collab.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'Password123!' })
  @IsString()
  @Length(8, 128)
  password: string;

  @ApiProperty({ example: 'Ann' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ann@collab.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: PublicUser })
  user: PublicUser;
}
