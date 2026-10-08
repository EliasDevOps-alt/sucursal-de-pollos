import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnnulDto } from '../purchases/dto/purchase.dto';
import { CollectionsService } from './collections.service';
import { CollectionFiltersDto, CreateCollectionDto } from './dto/collection.dto';

@ApiTags('collections')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COLLECTIONS_VIEW)
  findAll(@Query() filters: CollectionFiltersDto) {
    return this.collections.findAll(filters);
  }

  /** Clientes con deuda o canastillos por recoger, con ubicación (mapa de cobranza). */
  @Get('pending-map')
  @RequirePermissions(PERMISSIONS.COLLECTIONS_VIEW)
  pendingMap() {
    return this.collections.pendingMap();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COLLECTIONS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.collections.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COLLECTIONS_CREATE)
  create(@Body() dto: CreateCollectionDto, @CurrentUser() user: AuthUser) {
    return this.collections.create(dto, user);
  }

  @Post(':id/annul')
  @RequirePermissions(PERMISSIONS.COLLECTIONS_ANNUL)
  annul(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AnnulDto, @CurrentUser() user: AuthUser) {
    return this.collections.annul(id, dto.reason, user);
  }
}
