import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from 'class-validator';

export class SetLotPriceDto {
  @ApiPropertyOptional({ description: 'Precio por kg (BOB). Tiene prioridad sobre el margen.', example: 17.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  pricePerKg?: number;

  @ApiPropertyOptional({ description: 'Margen % sobre el costo real', example: 20 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(500)
  marginPercentage?: number;

  @ApiPropertyOptional({ description: 'Sucursal; omitir para el precio central' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
