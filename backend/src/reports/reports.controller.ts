import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CashService } from '../finance/cash.service';
import { OperationsReportsService } from './operations-reports.service';
import { GroupBy, ReportsService, SalesFilters } from './reports.service';

const GROUPS: GroupBy[] = ['product', 'lot', 'customer', 'seller'];
const BRANCH_OR_ROUTES = /^(routes|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Parámetros comunes de los reportes: rango de fechas locales y filtros (cada reporte usa los suyos). */
class ReportQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from: use AAAA-MM-DD' }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to: use AAAA-MM-DD' }) to?: string;
  @IsOptional() @IsIn(GROUPS, { message: `groupBy debe ser uno de: ${GROUPS.join(', ')}` }) groupBy?: GroupBy;
  @IsOptional() @Matches(BRANCH_OR_ROUTES, { message: 'branchId: el id de una sucursal o "routes" (reparto)' }) branchId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() sellerId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() customerTypeId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
}

const salesFilters = (q: ReportQuery): SalesFilters => ({ branchId: q.branchId, categoryId: q.categoryId, sellerId: q.sellerId, customerId: q.customerId });

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly ops: OperationsReportsService,
    private readonly cash: CashService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async dashboard(@Query() q: ReportQuery, @CurrentUser() user: AuthUser) {
    const can = (p: string) => user.permissions.includes(p);
    const range = this.reports.resolveRange(q.from, q.to);
    // Costos y márgenes solo para quien tiene permiso financiero; la operación del día según lo que cada uno puede ver.
    const [base, today, money] = await Promise.all([
      this.reports.dashboard(range, can(PERMISSIONS.REPORTS_FINANCIAL), salesFilters(q)),
      this.ops.today({ routes: can(PERMISSIONS.ROUTES_VIEW), crates: can(PERMISSIONS.CRATES_VIEW) }),
      can(PERMISSIONS.CASH_VIEW) ? this.cash.summary(user) : null,
    ]);
    return {
      ...base,
      today: {
        ...today,
        money: money ? { cashOnHand: money.cashOnHand, inBank: money.inBank, pendingSettlement: money.pendingSettlement, supplierPayables: money.supplierPayables } : undefined,
      },
    };
  }

  @Get('sales-by-day')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  salesByDay(@Query() q: ReportQuery) {
    return this.reports.salesByDay(this.reports.resolveRange(q.from, q.to), salesFilters(q));
  }

  @Get('profitability')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  profitability(@Query() q: ReportQuery) {
    return this.reports.profitability(this.reports.resolveRange(q.from, q.to), q.groupBy ?? 'product', salesFilters(q));
  }

  @Get('shrinkage')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  shrinkage(@Query() q: ReportQuery) {
    return this.reports.shrinkage(this.reports.resolveRange(q.from, q.to));
  }

  @Get('receivables')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  receivables() {
    return this.reports.receivables();
  }

  @Get('alerts')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  alerts() {
    return this.reports.alerts();
  }

  @Get('options')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  options() {
    return this.ops.options();
  }

  /** Cumplimiento de entregas, problemas, kilos y cobros por chofer, vehículo y día. */
  @Get('logistics')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.ROUTES_VIEW)
  logistics(@Query() q: ReportQuery) {
    return this.ops.logistics(this.reports.resolveRange(q.from, q.to), { driverId: q.driverId, vehicleId: q.vehicleId });
  }

  /** Dónde están los canastillos y sus movimientos, bajas y sanciones del período. */
  @Get('crates')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW, PERMISSIONS.CRATES_VIEW)
  crates(@Query() q: ReportQuery) {
    return this.ops.crates(this.reports.resolveRange(q.from, q.to));
  }

  /** Central y sucursales comparadas: ventas, margen, transferencias, pérdidas y stock. */
  @Get('branches')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  branches(@Query() q: ReportQuery) {
    return this.ops.branches(this.reports.resolveRange(q.from, q.to));
  }

  /** Compras por proveedor, producto y día; costo por kg, merma y deuda con proveedores. */
  @Get('purchases')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  purchases(@Query() q: ReportQuery) {
    return this.ops.purchases(this.reports.resolveRange(q.from, q.to), { supplierId: q.supplierId });
  }

  /** Mejores clientes, nuevos, los que dejaron de comprar y ventas por tipo de cliente. */
  @Get('customers')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  customers(@Query() q: ReportQuery) {
    return this.ops.customers(this.reports.resolveRange(q.from, q.to), { customerTypeId: q.customerTypeId });
  }
}
