import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, SaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const SALE_PAYMENT_METHODS = ['EFECTIVO', 'QR', 'TRANSFERENCIA'] as const;

export class LotChoiceDto {
  @ApiProperty()
  @IsUUID()
  lotId: string;

  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weightKg: number;
}

export class SaleLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 200 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weightKg: number;

  @ApiPropertyOptional({ description: 'Unidades (informativo; el stock se controla por kg)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Venta por canastillo: cuántos lleva (solo productos con peso por canastillo; weightKg es el peso real)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  crates?: number;

  @ApiPropertyOptional({ description: 'Precio final por kg si se modifica el sugerido' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceChangeReason?: string;

  @ApiPropertyOptional({ type: [LotChoiceDto], description: 'Lotes elegidos a mano; si se omite se aplica FEFO' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LotChoiceDto)
  lots?: LotChoiceDto[];
}

/** Credenciales de un supervisor que autoriza una excepción en el momento. */
export class AuthorizationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateSaleDto {
  @ApiProperty({ description: 'Almacén de origen' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Omitir para venta rápida (debe pagarse completa)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ type: [SaleLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  items: SaleLineDto[];

  @ApiPropertyOptional({ description: 'Monto pagado ahora; por defecto el total' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ enum: SALE_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(SALE_PAYMENT_METHODS)
  paymentMethod?: (typeof SALE_PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ description: 'Venta por canastillo a un cliente registrado: los canastillos salen con él (por defecto sí)' })
  @IsOptional()
  @IsBoolean()
  cratesToCustomer?: boolean;

  @ApiPropertyOptional({ description: 'Motivo para forzar lotes fuera del orden FEFO' })
  @IsOptional()
  @IsString()
  forceReason?: string;

  @ApiPropertyOptional({ description: 'Motivo para superar el límite de crédito' })
  @IsOptional()
  @IsString()
  creditExceptionReason?: string;

  @ApiPropertyOptional({ type: AuthorizationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorizationDto)
  authorization?: AuthorizationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Preventa que esta venta atiende' })
  @IsOptional()
  @IsUUID()
  presaleId?: string;
}

export class SaleFiltersDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}
