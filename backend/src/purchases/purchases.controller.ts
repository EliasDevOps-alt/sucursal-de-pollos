import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PurchaseStatus } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto, CreatePurchaseDto, CreateReceptionDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  @ApiQuery({ name: 'status', enum: PurchaseStatus, required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  findAll(
    @Query('status', new ParseEnumPipe(PurchaseStatus, { optional: true })) status?: PurchaseStatus,
    @Query('supplierId', new ParseUUIDPipe({ optional: true })) supplierId?: string,
  ) {
    return this.purchases.findAll({ status, supplierId });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASES_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: AuthUser) {
    return this.purchases.create(dto, user.id);
  }

  @Post(':id/annul')
  @RequirePermissions(PERMISSIONS.PURCHASES_ANNUL)
  annul(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.purchases.annul(id, dto.reason, user.id);
  }

  @Post(':id/reception')
  @RequirePermissions(PERMISSIONS.RECEPTIONS_CREATE)
  receive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateReceptionDto, @CurrentUser() user: AuthUser) {
    return this.purchases.receive(id, dto, user.id);
  }
}
