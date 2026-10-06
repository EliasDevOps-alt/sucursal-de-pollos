import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

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
