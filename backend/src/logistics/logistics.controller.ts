import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import {
  CloseRouteDto,
  CreateVehicleDto,
  DeliverStopDto,
  DispatchRouteDto,
  FailStopDto,
  RouteFiltersDto,
  SaveRouteDto,
  UpdateVehicleDto,
} from './dto/logistics.dto';
import { RoutesService } from './routes.service';
import { VehiclesService } from './vehicles.service';

@ApiTags('logistics')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROUTES_VIEW)
  findAll() {
    return this.vehicles.findAll();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  create(@Body() dto: CreateVehicleDto, @CurrentUser() user: AuthUser) {
    return this.vehicles.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto, @CurrentUser() user: AuthUser) {
    return this.vehicles.update(id, dto, user);
  }
}

@ApiTags('logistics')
@ApiBearerAuth()
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROUTES_VIEW)
  findAll(@Query() filters: RouteFiltersDto) {
    return this.routes.findAll(filters);
  }

  /** Preventas pendientes que se pueden asignar a una ruta de esa fecha. */
  @Get('candidates')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  @ApiQuery({ name: 'date', example: '2026-10-08' })
  candidates(@Query('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new BadRequestException('Fecha inválida (AAAA-MM-DD)');
    return this.routes.candidates(date);
  }

  /** Choferes activos (para asignar). */
  @Get('drivers')
  @RequirePermissions(PERMISSIONS.ROUTES_VIEW)
  drivers() {
    return this.routes.drivers();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROUTES_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.findOne(id);
  }

  @Get(':id/tracking')
  @RequirePermissions(PERMISSIONS.ROUTES_VIEW)
  tracking(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.tracking(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  create(@Body() dto: SaveRouteDto, @CurrentUser() user: AuthUser) {
    return this.routes.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveRouteDto, @CurrentUser() user: AuthUser) {
    return this.routes.update(id, dto, user);
  }

  @Post(':id/dispatch')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  dispatch(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DispatchRouteDto, @CurrentUser() user: AuthUser) {
    return this.routes.dispatch(id, dto, user);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseRouteDto, @CurrentUser() user: AuthUser) {
    return this.routes.close(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.routes.cancel(id, dto.reason, user);
  }

  /** Registrar una entrega desde la web (p. ej. si el chofer no tiene teléfono). El chofer usa la sincronización móvil. */
  @Post('stops/:stopId/deliver')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  deliver(@Param('stopId', ParseUUIDPipe) stopId: string, @Body() dto: DeliverStopDto, @CurrentUser() user: AuthUser) {
    return this.routes.deliver(stopId, dto, user);
  }

  @Post('stops/:stopId/fail')
  @RequirePermissions(PERMISSIONS.ROUTES_MANAGE)
  fail(@Param('stopId', ParseUUIDPipe) stopId: string, @Body() dto: FailStopDto, @CurrentUser() user: AuthUser) {
    return this.routes.fail(stopId, dto, user);
  }
}
