import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { ReceiptsService } from './receipts.service';

class PrintDto {
  @IsIn(['WEB', 'BLUETOOTH'])
  channel: 'WEB' | 'BLUETOOTH';
}

class CompanyDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(30) nit?: string;
  @IsOptional() @IsString() @MaxLength(120) address?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) footer?: string;
}

@ApiTags('receipts')
@ApiBearerAuth()
@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** Datos del negocio para el encabezado de los recibos (cualquier usuario: la app los necesita sin conexión). */
  @Get('settings/company')
  company() {
    return this.receipts.company();
  }

  @Put('settings/company')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  updateCompany(@Body() dto: CompanyDto, @CurrentUser() user: AuthUser) {
    return this.receipts.updateCompany(dto, user);
  }

  /** Historial de impresiones (consulta y reimpresión). */
  @Get('receipts/prints')
  @RequirePermissions(PERMISSIONS.SALES_VIEW)
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  prints(@Query('type') type?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.receipts.prints({ type, from, to });
  }

  /** Comprobante: venta, entrega, cobro, rendicion o caja. Los permisos dependen del tipo. */
  @Get('receipts/:type/:id')
  build(@Param('type') type: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.receipts.build(type, id, user);
  }

  /** Registra una impresión: la primera es el original; las siguientes, copias numeradas. */
  @Post('receipts/:type/:id/print')
  print(@Param('type') type: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PrintDto, @CurrentUser() user: AuthUser) {
    return this.receipts.print(type, id, dto.channel, user);
  }
}
