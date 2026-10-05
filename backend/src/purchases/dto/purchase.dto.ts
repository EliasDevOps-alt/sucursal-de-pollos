import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpirySource, ShrinkageTreatment } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export const PAYMENT_METHODS = ['EFECTIVO', 'QR', 'TRANSFERENCIA', 'CREDITO_PROVEEDOR'] as const;

const DEC = { maxDecimalPlaces: 4 };

export class PurchaseItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Unidades (pollos)', example: 120 })
  @IsOptional()
  @IsNumber(DEC)
  @Min(0)
  purchasedQuantity?: number;

  @ApiProperty({ description: 'Kg comprados según el proveedor', example: 250 })
  @IsNumber(DEC)
  @IsPositive()
  purchasedWeightKg: number;

  @ApiProperty({ description: 'Costo por kg (BOB)', example: 14.5 })
  @IsNumber(DEC)
  @IsPositive()
  unitCost: number;
}

export class CreatePurchaseDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ description: 'Almacén de destino' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Fecha de compra (por defecto, ahora)' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La compra debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

export class AnnulDto {
  @ApiProperty({ example: 'Compra registrada por error' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  reason: string;
}

export class ReceptionItemDto {
  @ApiProperty()
  @IsUUID()
  purchaseItemId: string;

  @ApiProperty({ description: 'Peso bruto en balanza (incluye canastillos)', example: 262 })
  @IsNumber(DEC)
  @IsPositive()
  receivedWeightKg: number;

  @ApiPropertyOptional({ description: 'Tara total de canastillos (kg)', example: 16 })
  @IsOptional()
  @IsNumber(DEC)
  @Min(0)
  canastilloWeightKg?: number;

  @ApiPropertyOptional({ description: 'Unidades recibidas', example: 118 })
  @IsOptional()
  @IsNumber(DEC)
  @Min(0)
  receivedQuantity?: number;

  @ApiProperty({ example: '2026-10-12' })
  @IsDateString()
  expiryDate: string;

  @ApiPropertyOptional({ enum: ExpirySource, default: ExpirySource.SUPPLIER })
  @IsOptional()
  @IsEnum(ExpirySource)
  expirySource?: ExpirySource;

  @ApiPropertyOptional({
    enum: ShrinkageTreatment,
    default: ShrinkageTreatment.ABSORB,
    description: 'ABSORB: la merma es pérdida. INCORPORATE: la merma sube el costo real del kg.',
  })
  @IsOptional()
  @IsEnum(ShrinkageTreatment)
  shrinkageTreatment?: ShrinkageTreatment;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualityNotes?: string;
}

export class CreateReceptionDto {
  @ApiPropertyOptional({ description: 'Fecha/hora de recepción (por defecto, ahora)' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ReceptionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceptionItemDto)
  items: ReceptionItemDto[];
}
