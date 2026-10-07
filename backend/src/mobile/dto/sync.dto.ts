import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export const OPERATION_TYPES = [
  'CUSTOMER_CREATE',
  'CUSTOMER_ADDRESS_ADD',
  'PRESALE_CREATE',
  'PRESALE_UPDATE',
  'PRESALE_CANCEL',
  'VISIT_CREATE',
  'GPS_POSITION',
  'DELIVERY_COMPLETE',
  'DELIVERY_FAIL',
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Identificador estable generado por la app al instalarse' })
  @IsString()
  @IsNotEmpty()
  deviceUuid: string;

  @ApiProperty({ example: 'android' })
  @IsString()
  platform: string;

  @ApiPropertyOptional({ example: '0.1.0' })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class SyncOperationDto {
  @ApiProperty({ description: 'UUID generado en el móvil; reenviar la misma operación no la duplica' })
  @IsUUID()
  deviceOperationId: string;

  @ApiProperty({ enum: OPERATION_TYPES })
  @IsIn(OPERATION_TYPES)
  operationType: OperationType;

  @ApiProperty({ description: 'Datos de la operación (según el tipo)' })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiProperty({ description: 'Fecha/hora local del dispositivo al registrar la operación' })
  @IsDateString()
  createdAtDevice: string;
}

export class SyncRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deviceUuid: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiProperty({ type: [SyncOperationDto], description: 'En el orden en que se registraron' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}
