import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { InventoryQueryService } from './inventory-query.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly query: InventoryQueryService) {}

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
}
