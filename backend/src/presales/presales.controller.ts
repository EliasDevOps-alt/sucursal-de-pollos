import { BadRequestException, Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PresaleStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import { PresalesService } from './presales.service';

@ApiTags('presales')
@ApiBearerAuth()
@Controller('presales')
export class PresalesController {
  constructor(private readonly presales: PresalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRESALES_VIEW_OWN)
  @ApiQuery({ name: 'status', enum: PresaleStatus, required: false })
  findAll(@CurrentUser() user: AuthUser, @Query('status', new ParseEnumPipe(PresaleStatus, { optional: true })) status?: PresaleStatus) {
    return this.presales.findAll(user, status);
  }

  @Get('preventistas')
  @RequirePermissions(PERMISSIONS.PRESALES_VIEW_ALL)
  preventistas() {
    return this.presales.preventistas();
  }

  /** Recorrido del día: GET /presales/activity?userId=…&date=AAAA-MM-DD */
  @Get('activity')
  @RequirePermissions(PERMISSIONS.PRESALES_VIEW_ALL)
  activity(@Query('userId', ParseUUIDPipe) userId: string, @Query('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new BadRequestException('Fecha inválida (use AAAA-MM-DD)');
    return this.presales.activity(userId, date);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRESALES_VIEW_OWN)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.presales.findOne(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PRESALES_MANAGE)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.presales.cancel(id, dto.reason, user);
  }
}
