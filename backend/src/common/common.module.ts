import { Global, Module } from '@nestjs/common';
import { ReceivablesService } from './receivables.service';
import { SequenceService } from './sequence.service';

@Global()
@Module({
  providers: [SequenceService, ReceivablesService],
  exports: [SequenceService, ReceivablesService],
})
export class CommonModule {}
