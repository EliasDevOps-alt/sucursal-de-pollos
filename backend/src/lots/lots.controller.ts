import { Body, Controller, Delete, Get, Param, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LotStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { SetLotPriceDto } from './dto/lot.dto';
import { LotsService } from './lots.service';

@ApiTags('lots')
@ApiBearerAuth()
@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LOTS_VIEW)
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'status', enum: LotStatus, required: false })
  @ApiQuery({ name: 'onlyAvailable', required: false, type: Boolean })
  @ApiQuery({ name: 'expiringWithinDays', required: false, type: Number })
  findAll(
    @Query('productId', new ParseUUIDPipe({ optional: true })) productId?: string,
    @Query('warehouseId', new ParseUUIDPipe({ optional: true })) warehouseId?: string,
    @Query('status', new ParseEnumPipe(LotStatus, { optional: true })) status?: LotStatus,
    @Query('onlyAvailable', new ParseBoolPipe({ optional: true })) onlyAvailable?: boolean,
    @Query('expiringWithinDays', new ParseIntPipe({ optional: true })) expiringWithinDays?: number,
  ) {
    return this.lots.findAll({ productId, warehouseId, status, onlyAvailable, expiringWithinDays });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.LOTS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lots.findOne(id);
  }

  @Post(':id/prices')
  @RequirePermissions(PERMISSIONS.PRICE_CONFIGURE)
  setPrice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetLotPriceDto, @CurrentUser() user: AuthUser) {
    return this.lots.setPrice(id, dto, user.id);
  }

  /** Quita el precio propio de una sucursal: vuelve a vender ese lote al precio central. */
  @Delete(':id/prices/branches/:branchId')
  @RequirePermissions(PERMISSIONS.PRICE_CONFIGURE)
  clearBranchPrice(@Param('id', ParseUUIDPipe) id: string, @Param('branchId', ParseUUIDPipe) branchId: string, @CurrentUser() user: AuthUser) {
    return this.lots.clearBranchPrice(id, branchId, user.id);
  }
}
