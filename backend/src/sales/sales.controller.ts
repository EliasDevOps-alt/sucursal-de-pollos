import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import { CreateSaleDto, SaleFiltersDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  findAll(@Query() filters: SaleFiltersDto) {
    return this.sales.findAll(filters);
  }

  @Get('available-lots')
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  availableLots(
    @Query('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.sales.availableLotsFor(warehouseId, productId);
  }

  /** Vista previa: calcula lotes, precios, crédito y autorizaciones sin guardar nada. */
  @Post('quote')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  quote(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.sales.quote(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SALES_CREATE)
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.sales.create(dto, user);
  }

  @Post(':id/annul')
  @RequirePermissions(PERMISSIONS.SALES_ANNUL)
  annul(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.sales.annul(id, dto.reason, user);
  }
}
