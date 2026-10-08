import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [LogisticsModule, CollectionsModule, ReceiptsModule],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}
