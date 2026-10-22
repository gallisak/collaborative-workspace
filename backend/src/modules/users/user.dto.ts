import { ApiProperty } from '@nestjs/swagger';

export class PublicUser {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ann@collab.local' })
  email: string;

  @ApiProperty({ example: 'Ann' })
  name: string;
}
