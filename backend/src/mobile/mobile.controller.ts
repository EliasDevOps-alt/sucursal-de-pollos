import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { RegisterDeviceDto, SyncRequestDto } from './dto/sync.dto';
import { MobileService } from './mobile.service';

@ApiTags('mobile')
@ApiBearerAuth()
@Controller('mobile')
export class MobileController {
  constructor(private readonly mobile: MobileService) {}

  @Post('devices')
  @RequirePermissions(PERMISSIONS.SYNC_PUSH)
  register(@Body() dto: RegisterDeviceDto, @CurrentUser() user: AuthUser) {
    return this.mobile.registerDevice(dto, user);
  }

  /** Catálogo, clientes y preventas propias para trabajar sin conexión. */
  @Get('bootstrap')
  @RequirePermissions(PERMISSIONS.CATALOG_VIEW, PERMISSIONS.CUSTOMERS_VIEW)
  bootstrap(@CurrentUser() user: AuthUser) {
    return this.mobile.bootstrap(user);
  }

  /** Envía las operaciones pendientes del teléfono. Idempotente por deviceOperationId. */
  @Post('sync')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SYNC_PUSH)
  sync(@Body() dto: SyncRequestDto, @CurrentUser() user: AuthUser) {
    return this.mobile.sync(dto, user);
  }
}
