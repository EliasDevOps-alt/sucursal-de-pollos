import { applyDecorators, BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { GroupBy, ReportsService } from './reports.service';

const GROUPS: GroupBy[] = ['product', 'lot', 'customer', 'seller'];
const RangeQuery = () =>
  applyDecorators(
    ApiQuery({ name: 'from', required: false, description: 'AAAA-MM-DD' }),
    ApiQuery({ name: 'to', required: false, description: 'AAAA-MM-DD' }),
  );

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @RangeQuery()
  dashboard(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentUser() user: AuthUser) {
    // Costos y márgenes solo para quien tiene permiso financiero.
    return this.reports.dashboard(this.reports.resolveRange(from, to), user.permissions.includes(PERMISSIONS.REPORTS_FINANCIAL));
  }

  @Get('sales-by-day')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  @RangeQuery()
  salesByDay(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.salesByDay(this.reports.resolveRange(from, to));
  }

  @Get('profitability')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  @RangeQuery()
  @ApiQuery({ name: 'groupBy', enum: GROUPS, required: false })
  profitability(@Query('from') from?: string, @Query('to') to?: string, @Query('groupBy') groupBy: GroupBy = 'product') {
    if (!GROUPS.includes(groupBy)) throw new BadRequestException(`groupBy debe ser uno de: ${GROUPS.join(', ')}`);
    return this.reports.profitability(this.reports.resolveRange(from, to), groupBy);
  }

  @Get('shrinkage')
  @RequirePermissions(PERMISSIONS.REPORTS_FINANCIAL)
  @RangeQuery()
  shrinkage(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.shrinkage(this.reports.resolveRange(from, to));
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
}
