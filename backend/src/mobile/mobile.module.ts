import { Module } from '@nestjs/common';
import { LogisticsModule } from '../logistics/logistics.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

@Module({
  imports: [LogisticsModule],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}
