import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransferItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 120.5, description: 'Peso a enviar (kg)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weightKg: number;

  @ApiPropertyOptional({ description: 'Unidades (informativo)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Lote a enviar; si se omite se toma por FEFO (vence primero, sale primero)' })
  @IsOptional()
  @IsUUID()
  lotId?: string;
}

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID()
  originWarehouseId: string;

  @ApiProperty()
  @IsUUID()
  destinationWarehouseId: string;

  @ApiProperty({ type: [TransferItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReceiveTransferItemDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Peso recibido en el destino (kg)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  receivedWeightKg: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  receivedQuantity?: number;
}

export class ReceiveTransferDto {
  @ApiPropertyOptional({
    type: [ReceiveTransferItemDto],
    description: 'Pesos recibidos por línea. Obligatorio si la sucursal de destino pesa las transferencias; si no, se recibe lo enviado.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferItemDto)
  items?: ReceiveTransferItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferFiltersDto {
  @IsOptional()
  @IsIn(['IN_TRANSIT', 'RECEIVED', 'CANCELLED'])
  status?: 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
