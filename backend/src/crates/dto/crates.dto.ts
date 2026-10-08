import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CrateHolderType, CrateMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class CrateHolderDto {
  @ApiProperty({ enum: CrateHolderType })
  @IsEnum(CrateHolderType)
  type: CrateHolderType;

  @ApiProperty()
  @IsUUID()
  id: string;
}

export class CrateMovementDto {
  @ApiProperty({ enum: ['INITIAL', 'TRANSFER', 'RETURN', 'WRITE_OFF'] })
  @IsEnum(CrateMovementType)
  type: CrateMovementType;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity: number;

  @ApiPropertyOptional({ type: CrateHolderDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CrateHolderDto)
  from?: CrateHolderDto;

  @ApiPropertyOptional({ type: CrateHolderDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CrateHolderDto)
  to?: CrateHolderDto;

  @ApiPropertyOptional({ example: 'Canastillos rotos al descargar' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Baja de canastillos perdidos por un cliente: monto por canastillo que se suma a su deuda', example: 35 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  chargePerCrate?: number;
}

export class CrateFiltersDto {
  @IsOptional()
  @IsEnum(CrateHolderType)
  holderType?: CrateHolderType;

  @IsOptional()
  @IsUUID()
  holderId?: string;

  @IsOptional()
  @IsEnum(CrateMovementType)
  type?: CrateMovementType;
}
