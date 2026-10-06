import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CustomerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddressDto {
  @ApiProperty({ example: 'Tienda' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: 'Calle Sucre #45, Mercado Central' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: -17.7833 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: -63.1821 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Pollería Doña Juana' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'CI o NIT' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiProperty()
  @IsUUID()
  customerTypeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  rankId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  creditEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Límite propio; si se omite se usa el del rango' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional({ type: AddressDto, description: 'Dirección principal' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

export class UpdateCustomerDto extends PartialType(OmitType(CreateCustomerDto, ['address'] as const)) {
  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ description: 'Obligatorio al cambiar el rango' })
  @IsOptional()
  @IsString()
  rankChangeReason?: string;
}
