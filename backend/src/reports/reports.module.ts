import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { OperationsReportsService } from './operations-reports.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, OperationsReportsService],
})
export class ReportsModule {}
