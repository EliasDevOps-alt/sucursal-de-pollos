import { Body, Controller, Get, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateSupplierDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateSupplierDto,
} from './dto/catalog.dto';

const { CATALOG_VIEW, CATALOG_MANAGE } = PERMISSIONS;

@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @RequirePermissions(CATALOG_VIEW)
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('categories')
  @RequirePermissions(CATALOG_MANAGE)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(CATALOG_MANAGE)
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.catalog.updateCategory(id, dto);
  }

  @Get('products')
  @RequirePermissions(CATALOG_VIEW)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  listProducts(@Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean) {
    return this.catalog.listProducts(includeInactive);
  }

  @Post('products')
  @RequirePermissions(CATALOG_MANAGE)
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.catalog.createProduct(dto, user.id);
  }

  @Patch('products/:id')
  @RequirePermissions(CATALOG_MANAGE)
  updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthUser) {
    return this.catalog.updateProduct(id, dto, user.id);
  }

  @Get('suppliers')
  @RequirePermissions(CATALOG_VIEW)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  listSuppliers(@Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean) {
    return this.catalog.listSuppliers(includeInactive);
  }

  @Post('suppliers')
  @RequirePermissions(CATALOG_MANAGE)
  createSupplier(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.catalog.createSupplier(dto, user.id);
  }

  @Patch('suppliers/:id')
  @RequirePermissions(CATALOG_MANAGE)
  updateSupplier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.catalog.updateSupplier(id, dto, user.id);
  }

  @Get('branches')
  @RequirePermissions(CATALOG_VIEW)
  listBranches() {
    return this.catalog.listBranches();
  }

  @Get('warehouses')
  @RequirePermissions(CATALOG_VIEW)
  listWarehouses() {
    return this.catalog.listWarehouses();
  }
}
