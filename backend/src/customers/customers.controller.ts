import { Body, Controller, Get, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CustomersService } from './customers.service';
import { AddressDto, CreateCustomerDto, UpdateCustomerDto, UpdateRankDto } from './dto/customer.dto';

const { CUSTOMERS_VIEW, CUSTOMERS_MANAGE } = PERMISSIONS;

@ApiTags('customers')
@ApiBearerAuth()
@Controller()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('customer-types')
  @RequirePermissions(CUSTOMERS_VIEW)
  types() {
    return this.customers.listTypes();
  }

  @Get('customer-ranks')
  @RequirePermissions(CUSTOMERS_VIEW)
  ranks() {
    return this.customers.listRanks();
  }

  @Get('customers')
  @RequirePermissions(CUSTOMERS_VIEW)
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'withDebt', required: false, type: Boolean })
  findAll(
    @Query('search') search?: string,
    @Query('withDebt', new ParseBoolPipe({ optional: true })) withDebt?: boolean,
  ) {
    return this.customers.findAll(search, withDebt);
  }

  @Patch('customer-ranks/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_RANK_CHANGE)
  updateRank(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRankDto, @CurrentUser() user: AuthUser) {
    return this.customers.updateRank(id, dto, user);
  }

  /** Clientes que ya cumplen las condiciones de un rango superior (compra promedio y antigüedad de la deuda). */
  @Get('customers/rank-suggestions')
  @RequirePermissions(PERMISSIONS.CUSTOMER_RANK_CHANGE)
  rankSuggestions() {
    return this.customers.rankSuggestions();
  }

  @Get('customers/:id')
  @RequirePermissions(CUSTOMERS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Post('customers')
  @RequirePermissions(CUSTOMERS_MANAGE)
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customers.create(dto, user);
  }

  @Patch('customers/:id')
  @RequirePermissions(CUSTOMERS_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customers.update(id, dto, user);
  }

  @Post('customers/:id/addresses')
  @RequirePermissions(CUSTOMERS_MANAGE)
  addAddress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddressDto, @CurrentUser() user: AuthUser) {
    return this.customers.addAddress(id, dto, user);
  }
}
