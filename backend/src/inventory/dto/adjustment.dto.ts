import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentKind, AdjustmentReason } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MinLength, Min, ValidateIf } from 'class-validator';

export class CreateAdjustmentDto {
  @ApiProperty({ enum: AdjustmentKind, description: 'COUNT = conteo físico (el saldo pasa al peso contado); LOSS = baja o pérdida' })
  @IsEnum(AdjustmentKind)
  kind: AdjustmentKind;

  @ApiProperty({ enum: AdjustmentReason, description: 'Un conteo usa PHYSICAL_COUNT; una baja, el motivo de la pérdida' })
  @IsEnum(AdjustmentReason)
  reasonCode: AdjustmentReason;

  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  @ApiProperty()
  @IsUUID()
  lotId: string;

  @ApiPropertyOptional({ description: 'Conteo: peso contado físicamente (kg)' })
  @ValidateIf((o: CreateAdjustmentDto) => o.kind === AdjustmentKind.COUNT)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedWeightKg?: number;

  @ApiPropertyOptional({ description: 'Baja: peso que se da de baja (kg)' })
  @ValidateIf((o: CreateAdjustmentDto) => o.kind === AdjustmentKind.LOSS)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  weightKg?: number;

  @ApiProperty({ example: 'Conteo semanal; diferencia por goteo en cámara' })
  @IsString()
  @MinLength(5, { message: 'Explique el motivo (al menos 5 caracteres)' })
  notes: string;
}

export class AdjustmentFiltersDto {
  @IsOptional()
  @IsEnum(AdjustmentKind)
  kind?: AdjustmentKind;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
