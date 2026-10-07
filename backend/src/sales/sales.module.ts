import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { ReturnsService } from './returns.service';
import { SalesService } from './sales.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, ReturnsService],
  exports: [SalesService],
})
export class SalesModule {}
