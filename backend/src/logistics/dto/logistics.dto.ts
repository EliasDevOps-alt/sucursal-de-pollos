import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryProblem, RouteStatus, VehicleOwnership } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// ── Vehículos ──

export class CreateVehicleDto {
  @ApiProperty({ example: '2345-XKD' })
  @IsString()
  @MinLength(4)
  @MaxLength(15)
  plate: string;

  @ApiProperty({ example: 'Camioneta Toyota Hilux con furgón térmico' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: VehicleOwnership })
  @IsEnum(VehicleOwnership)
  ownership: VehicleOwnership;

  @ApiPropertyOptional({ description: 'Empresa o dueño del vehículo subcontratado' })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  capacityKg: number;

  @ApiProperty({ example: 70 })
  @IsInt()
  @Min(0)
  capacityCrates: number;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsEnum(VehicleOwnership)
  ownership?: VehicleOwnership;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  capacityKg?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacityCrates?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Rutas ──

export class RouteStopDto {
  @ApiProperty()
  @IsUUID()
  presaleId: string;

  @ApiPropertyOptional({ description: 'Autoriza de antemano que esta entrega supere el límite de crédito (requiere credit.exception_authorize)' })
  @IsOptional()
  @IsBoolean()
  authorizeCredit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  creditReason?: string;
}

export class SaveRouteDto {
  @ApiProperty({ example: '2026-10-08' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD)' })
  routeDate: string;

  @ApiProperty()
  @IsUUID()
  vehicleId: string;

  @ApiProperty()
  @IsUUID()
  driverId: string;

  @ApiPropertyOptional({ description: 'Almacén de donde se carga (por defecto el central)' })
  @IsOptional()
  @IsUUID()
  originWarehouseId?: string;

  @ApiProperty({ type: [RouteStopDto], description: 'Paradas en el orden de visita' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un pedido' })
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops: RouteStopDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class LoadLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Kg que se cargan (puede incluir un margen sobre lo pedido)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weightKg: number;
}

export class DispatchRouteDto {
  @ApiPropertyOptional({ type: [LoadLineDto], description: 'Carga por producto; por defecto, lo pedido' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoadLineDto)
  loads?: LoadLineDto[];
}

export class ReturnLineDto {
  @ApiProperty()
  @IsUUID()
  lotId: string;

  @ApiProperty({ description: 'Kg que vuelven al almacén (pesados)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  receivedWeightKg: number;
}

export class CloseRouteDto {
  @ApiPropertyOptional({ type: [ReturnLineDto], description: 'Sobrante pesado por lote; por defecto, el saldo del vehículo' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  returns?: ReturnLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RouteFiltersDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;
}

// ── Entregas ──

export class DeliveredItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  deliveredWeightKg: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el peso entregado difiere del pedido' })
  @IsOptional()
  @IsString()
  differenceReason?: string;
}

export const DELIVERY_PAYMENT_METHODS = ['EFECTIVO', 'QR', 'TRANSFERENCIA'] as const;

export class DeliverStopDto {
  @ApiProperty({ type: [DeliveredItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveredItemDto)
  items: DeliveredItemDto[];

  @ApiProperty({ description: 'Monto cobrado al entregar (0 = todo a crédito)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount: number;

  @ApiPropertyOptional({ enum: DELIVERY_PAYMENT_METHODS })
  @IsOptional()
  @IsIn(DELIVERY_PAYMENT_METHODS)
  paymentMethod?: (typeof DELIVERY_PAYMENT_METHODS)[number];

  @ApiProperty({ example: 'Juana Pérez' })
  @IsString()
  @MinLength(2, { message: 'Indique quién recibe' })
  receivedByName: string;

  @ApiPropertyOptional({ description: 'Firma como imagen PNG (data URL)' })
  @IsOptional()
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'Firma inválida' })
  @MaxLength(1_500_000)
  signature?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class FailStopDto {
  @ApiProperty({ enum: DeliveryProblem })
  @IsEnum(DeliveryProblem)
  problemType: DeliveryProblem;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}

export class TrackingQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  @Type(() => Number)
  limit?: number;
}
