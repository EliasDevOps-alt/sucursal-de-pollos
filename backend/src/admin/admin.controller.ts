import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AuditFiltersDto, CustomerTypeDto, ResolveSyncDto, SyncFiltersDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('admin/customer-types')
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  customerTypes() {
    return this.admin.listCustomerTypes();
  }

  @Post('customer-types')
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  createCustomerType(@Body() dto: CustomerTypeDto, @CurrentUser() user: AuthUser) {
    return this.admin.createCustomerType(dto, user.id);
  }

  @Patch('customer-types/:id')
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  updateCustomerType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerTypeDto, @CurrentUser() user: AuthUser) {
    return this.admin.updateCustomerType(id, dto, user.id);
  }

  @Get('audit-logs')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  auditLogs(@Query() filters: AuditFiltersDto) {
    return this.admin.auditLogs(filters);
  }

  @Get('sync-operations/issues')
  @RequirePermissions(PERMISSIONS.PRESALES_MANAGE)
  syncIssues(@Query() filters: SyncFiltersDto) {
    return this.admin.syncIssues(filters);
  }

  @Post('sync-operations/:id/resolve')
  @RequirePermissions(PERMISSIONS.PRESALES_MANAGE)
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveSyncDto, @CurrentUser() user: AuthUser) {
    return this.admin.resolveSyncIssue(id, dto.note, user.id);
  }
}
