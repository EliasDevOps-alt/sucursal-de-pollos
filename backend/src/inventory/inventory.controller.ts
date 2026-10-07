import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentFiltersDto, CreateAdjustmentDto } from './dto/adjustment.dto';
import { InventoryQueryService } from './inventory-query.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly query: InventoryQueryService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  @Get('stock')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiQuery({ name: 'warehouseId', required: false })
  stock(@Query('warehouseId', new ParseUUIDPipe({ optional: true })) warehouseId?: string) {
    return this.query.stockByProduct(warehouseId);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  movements(
    @Query('productId', new ParseUUIDPipe({ optional: true })) productId?: string,
    @Query('warehouseId', new ParseUUIDPipe({ optional: true })) warehouseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.query.movements({ productId, warehouseId, from, to });
  }

  @Get('lots')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiQuery({ name: 'productId', required: false })
  lots(
    @Query('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query('productId', new ParseUUIDPipe({ optional: true })) productId?: string,
  ) {
    return this.query.lotBalances(warehouseId, productId);
  }

  @Get('adjustments')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  adjustmentList(@Query() filters: AdjustmentFiltersDto, @CurrentUser() user: AuthUser) {
    return this.adjustments.findAll(filters, user);
  }

  @Post('adjustments')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.adjustments.create(dto, user);
  }

  @Post('adjustments/:id/annul')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  annulAdjustment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.adjustments.annul(id, dto.reason, user);
  }
}
