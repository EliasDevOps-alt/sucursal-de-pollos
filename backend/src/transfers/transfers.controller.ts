import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import { CreateTransferDto, ReceiveTransferDto, TransferFiltersDto } from './dto/transfer.dto';
import { TransfersService } from './transfers.service';

@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  findAll(@Query() filters: TransferFiltersDto, @CurrentUser() user: AuthUser) {
    return this.transfers.findAll(filters, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVENTORY_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.findOne(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSFERS_CREATE)
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthUser) {
    return this.transfers.create(dto, user);
  }

  @Post(':id/receive')
  @RequirePermissions(PERMISSIONS.TRANSFERS_RECEIVE)
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveTransferDto, @CurrentUser() user: AuthUser) {
    return this.transfers.receive(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.TRANSFERS_CREATE)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.transfers.cancel(id, dto.reason, user);
  }
}
