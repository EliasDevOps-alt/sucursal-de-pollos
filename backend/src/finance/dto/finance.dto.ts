import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashCategory, CashDirection } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export const EXPENSE_TYPES = ['COMBUSTIBLE', 'SUELDOS', 'ALQUILER', 'SERVICIOS', 'MANTENIMIENTO', 'VIATICOS', 'IMPUESTOS', 'INSUMOS', 'OTROS'] as const;

export class OpenSessionDto {
  @ApiProperty()
  @IsUUID()
  accountId: string;

  @ApiProperty({ description: 'Efectivo contado al abrir', example: 500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseSessionDto {
  @ApiProperty({ description: 'Efectivo contado al cerrar' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount: number;

  @ApiPropertyOptional({ description: 'Conteo por billete y moneda: { "200": 3, "100": 5, "0.5": 4 }' })
  @IsOptional()
  @IsObject()
  denominations?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Obligatorio si lo contado no coincide con lo esperado' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CashMovementDto {
  @ApiProperty()
  @IsUUID()
  accountId: string;

  @ApiProperty({ enum: ['EXPENSE', 'OTHER_INCOME'] })
  @IsEnum(CashCategory)
  category: CashCategory;

  @ApiPropertyOptional({ enum: EXPENSE_TYPES })
  @IsOptional()
  @IsIn(EXPENSE_TYPES)
  expenseType?: (typeof EXPENSE_TYPES)[number];

  @ApiProperty({ example: 180 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ example: 'Diésel camioneta 3456-KTR' })
  @IsString()
  @MinLength(3, { message: 'Describa el movimiento' })
  description: string;
}

export class TransferDto {
  @ApiProperty()
  @IsUUID()
  fromAccountId: string;

  @ApiProperty()
  @IsUUID()
  toAccountId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'Depósito del día' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateSettlementDto {
  @ApiProperty({ description: 'Chofer o cobrador que rinde' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Caja donde se recibe el efectivo' })
  @IsUUID()
  cashAccountId: string;

  @ApiProperty({ description: 'Efectivo contado al recibir' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCash: number;

  @ApiPropertyOptional({ description: 'Obligatorio si hay diferencia' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CashMovementFiltersDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsEnum(CashCategory)
  category?: CashCategory;

  @IsOptional()
  @IsEnum(CashDirection)
  direction?: CashDirection;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  @Type(() => Number)
  limit?: number;
}

export class PayPurchaseDto {
  @ApiProperty({ enum: ['EFECTIVO', 'QR', 'TRANSFERENCIA'] })
  @IsIn(['EFECTIVO', 'QR', 'TRANSFERENCIA'])
  paymentMethod: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
}
