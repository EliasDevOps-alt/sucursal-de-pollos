import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundMethod, ReturnDisposition } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { AuthorizationDto } from './sale.dto';

export class ReturnItemDto {
  @ApiProperty()
  @IsUUID()
  saleItemId: string;

  @ApiProperty({ example: 2.5, description: 'Peso devuelto (kg)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  weightKg: number;

  @ApiProperty({ enum: ReturnDisposition, description: 'RESTOCK = vuelve al stock del mismo lote; DISCARD = se descarta (pérdida)' })
  @IsEnum(ReturnDisposition)
  disposition: ReturnDisposition;
}

export class CreateReturnDto {
  @ApiProperty({ example: 'Producto con mal olor al abrir la bolsa' })
  @IsString()
  @MinLength(5, { message: 'Explique el motivo de la devolución (al menos 5 caracteres)' })
  reason: string;

  @ApiPropertyOptional({
    enum: RefundMethod,
    description: 'CREDIT = se descuenta de la deuda (o queda saldo a favor); CASH = se devuelve en efectivo. Por defecto: CREDIT si la venta fue a crédito.',
  })
  @IsOptional()
  @IsEnum(RefundMethod)
  refundMethod?: RefundMethod;

  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Indique qué se devuelve' })
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @ApiPropertyOptional({ type: AuthorizationDto, description: 'Credenciales de un supervisor si el usuario no puede autorizar devoluciones' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorizationDto)
  authorization?: AuthorizationDto;
}

export class ReturnFiltersDto {
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
