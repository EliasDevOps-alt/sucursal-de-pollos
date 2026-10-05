import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SaleUnit } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const CODE_RULE = /^[A-Z0-9-]{2,20}$/;
const CODE_MSG = 'El código debe tener 2–20 caracteres: mayúsculas, números o guion';

export class CreateCategoryDto {
  @ApiProperty({ example: 'ENT' })
  @Matches(CODE_RULE, { message: CODE_MSG })
  code: string;

  @ApiProperty({ example: 'Pollo entero' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty({ example: 'PE-SOF' })
  @Matches(CODE_RULE, { message: CODE_MSG })
  code: string;

  @ApiProperty({ example: 'Pollo entero SOFIA' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'SOFIA' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ enum: SaleUnit, default: SaleUnit.KG })
  @IsOptional()
  @IsEnum(SaleUnit)
  saleUnit?: SaleUnit;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSupplierDto {
  @ApiProperty({ example: 'Granja Avícola El Rosal' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'NIT o documento' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
