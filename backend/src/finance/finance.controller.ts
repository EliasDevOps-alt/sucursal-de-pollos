import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import { CashService } from './cash.service';
import { CashMovementDto, CashMovementFiltersDto, CloseSessionDto, CreateSettlementDto, OpenSessionDto, TransferDto } from './dto/finance.dto';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('cash')
export class FinanceController {
  constructor(private readonly cash: CashService) {}

  /** Saldos, cajas abiertas, por rendir, por pagar a proveedores e ingresos y egresos del período. */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  summary(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.cash.summary(user, from, to);
  }

  @Get('accounts')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  accounts(@CurrentUser() user: AuthUser) {
    return this.cash.accounts(user);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  movements(@Query() filters: CashMovementFiltersDto, @CurrentUser() user: AuthUser) {
    return this.cash.movements(filters, user);
  }

  /** Gasto u otro ingreso registrado a mano. */
  @Post('movements')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  manual(@Body() dto: CashMovementDto, @CurrentUser() user: AuthUser) {
    return this.cash.manual(dto, user);
  }

  @Post('movements/:id/reverse')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.cash.reverseManual(id, dto.reason, user);
  }

  @Post('transfers')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthUser) {
    return this.cash.transfer(dto, user);
  }

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  @ApiQuery({ name: 'accountId', required: false })
  sessions(@Query('accountId', new ParseUUIDPipe({ optional: true })) accountId?: string) {
    return this.cash.sessions(accountId);
  }

  @Get('sessions/:id')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  session(@Param('id', ParseUUIDPipe) id: string) {
    return this.cash.session(id);
  }

  @Post('sessions')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  open(@Body() dto: OpenSessionDto, @CurrentUser() user: AuthUser) {
    return this.cash.open(dto, user);
  }

  @Post('sessions/:id/close')
  @RequirePermissions(PERMISSIONS.CASH_MANAGE)
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseSessionDto, @CurrentUser() user: AuthUser) {
    return this.cash.close(id, dto, user);
  }

  /** Lo que cada chofer y cobrador tiene por rendir. */
  @Get('settlements/pending')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  pending() {
    return this.cash.pendingSettlements();
  }

  @Get('settlements')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  @ApiQuery({ name: 'userId', required: false })
  settlements(@Query('userId', new ParseUUIDPipe({ optional: true })) userId?: string) {
    return this.cash.settlements(userId);
  }

  @Get('settlements/:id')
  @RequirePermissions(PERMISSIONS.CASH_VIEW)
  settlement(@Param('id', ParseUUIDPipe) id: string) {
    return this.cash.settlement(id);
  }

  @Post('settlements')
  @RequirePermissions(PERMISSIONS.SETTLEMENTS_MANAGE)
  settle(@Body() dto: CreateSettlementDto, @CurrentUser() user: AuthUser) {
    return this.cash.settle(dto, user);
  }
}
