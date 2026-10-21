import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ enum: ['web', 'mobile'], description: 'mobile emite un token de 7 días para trabajar sin conexión' })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  client?: 'web' | 'mobile';
}
