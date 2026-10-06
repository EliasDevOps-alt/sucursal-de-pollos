import { Global, Module } from '@nestjs/common';
import { InventoryQueryService } from './inventory-query.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Global()
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryQueryService],
  exports: [InventoryService],
})
export class InventoryModule {}
