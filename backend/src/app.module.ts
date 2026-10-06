import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CollectionsModule } from './collections/collections.module';
import { CommonModule } from './common/common.module';
import { CustomersModule } from './customers/customers.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { LotsModule } from './lots/lots.module';
import { MobileModule } from './mobile/mobile.module';
import { PresalesModule } from './presales/presales.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuditModule,
    InventoryModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    PurchasesModule,
    LotsModule,
    CustomersModule,
    SalesModule,
    ReportsModule,
    PresalesModule,
    MobileModule,
    CollectionsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Todas las rutas requieren token salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
