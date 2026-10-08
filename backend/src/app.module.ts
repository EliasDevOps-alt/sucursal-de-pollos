import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CollectionsModule } from './collections/collections.module';
import { CommonModule } from './common/common.module';
import { CratesModule } from './crates/crates.module';
import { FinanceModule } from './finance/finance.module';
import { CustomersModule } from './customers/customers.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { LogisticsModule } from './logistics/logistics.module';
import { LotsModule } from './lots/lots.module';
import { MobileModule } from './mobile/mobile.module';
import { PresalesModule } from './presales/presales.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { TransfersModule } from './transfers/transfers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuditModule,
    InventoryModule,
    CratesModule,
    FinanceModule,
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
    AdminModule,
    TransfersModule,
    LogisticsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Todas las rutas requieren token salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
