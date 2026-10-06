import { Module } from '@nestjs/common';
import { PresalesController } from './presales.controller';
import { PresalesService } from './presales.service';

@Module({
  controllers: [PresalesController],
  providers: [PresalesService],
})
export class PresalesModule {}
