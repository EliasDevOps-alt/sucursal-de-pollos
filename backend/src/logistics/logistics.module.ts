import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { TransfersModule } from '../transfers/transfers.module';
import { RoutesController, VehiclesController } from './logistics.controller';
import { RoutesService } from './routes.service';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [TransfersModule, SalesModule],
  controllers: [VehiclesController, RoutesController],
  providers: [VehiclesService, RoutesService],
  exports: [RoutesService],
})
export class LogisticsModule {}
