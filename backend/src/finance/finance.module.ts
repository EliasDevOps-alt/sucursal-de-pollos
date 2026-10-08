import { Global, Module } from '@nestjs/common';
import { CashService } from './cash.service';
import { FinanceController } from './finance.controller';

@Global()
@Module({
  controllers: [FinanceController],
  providers: [CashService],
  exports: [CashService],
})
export class FinanceModule {}
