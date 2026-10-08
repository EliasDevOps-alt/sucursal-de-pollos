import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CratesService } from './crates.service';
import { CrateFiltersDto, CrateMovementDto } from './dto/crates.dto';

@ApiTags('crates')
@ApiBearerAuth()
@Controller('crates')
export class CratesController {
  constructor(private readonly crates: CratesService) {}

  /** Saldos por tenedor: almacenes, vehículos, clientes y responsables. */
  @Get('balances')
  @RequirePermissions(PERMISSIONS.CRATES_VIEW)
  balances() {
    return this.crates.balances();
  }

  @Get('holders')
  @RequirePermissions(PERMISSIONS.CRATES_VIEW)
  holders() {
    return this.crates.holders();
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.CRATES_VIEW)
  movements(@Query() filters: CrateFiltersDto) {
    return this.crates.movements(filters);
  }

  /** Alta, traspaso, recepción en almacén o baja (con sanción opcional al cliente). */
  @Post('movements')
  @RequirePermissions(PERMISSIONS.CRATES_MANAGE)
  create(@Body() dto: CrateMovementDto, @CurrentUser() user: AuthUser) {
    return this.crates.manual(dto, user);
  }
}
