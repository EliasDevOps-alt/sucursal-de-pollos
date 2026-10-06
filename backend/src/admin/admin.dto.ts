import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CustomerTypeDto {
  @ApiProperty({ example: 'Restaurante' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AuditFiltersDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SyncFiltersDto {
  @ApiPropertyOptional({ enum: ['pending', 'resolved', 'all'], default: 'pending' })
  @IsOptional()
  @IsIn(['pending', 'resolved', 'all'])
  view?: 'pending' | 'resolved' | 'all';
}

export class ResolveSyncDto {
  @ApiProperty({ example: 'Se confirmó con el preventista; el cliente se registró manualmente' })
  @IsString()
  @IsNotEmpty({ message: 'Indique cómo se resolvió' })
  note: string;
}
