import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength, NotEquals } from 'class-validator';

export const COLLECTION_METHODS = ['EFECTIVO', 'QR', 'TRANSFERENCIA'] as const;

export class CreateCollectionDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty({ example: 500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: COLLECTION_METHODS, description: 'Un solo método por cobro; un pago combinado se registra como varios cobros' })
  @IsIn(COLLECTION_METHODS)
  paymentMethod: (typeof COLLECTION_METHODS)[number];

  @ApiPropertyOptional({ description: 'N.º de transacción QR/transferencia' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Permite cobrar más que la deuda: el excedente queda como saldo a favor (anticipo)' })
  @IsOptional()
  @IsBoolean()
  allowAdvance?: boolean;
}

export class CollectionFiltersDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Saldo inicial o corrección de la deuda: + aumenta lo que debe el cliente, − la reduce (sin mover dinero). */
export class DebtAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty({ example: 350.5, description: 'Positivo aumenta la deuda; negativo la reduce' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @NotEquals(0)
  amount: number;

  @ApiProperty({ enum: ['OPENING', 'CORRECTION'] })
  @IsIn(['OPENING', 'CORRECTION'])
  kind: 'OPENING' | 'CORRECTION';

  @ApiProperty({ example: 'Deuda del cuaderno al 30/09' })
  @IsString()
  @MinLength(5, { message: 'Explique el motivo (al menos 5 caracteres)' })
  reason: string;
}
