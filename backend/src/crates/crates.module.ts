import { Global, Module } from '@nestjs/common';
import { CratesController } from './crates.controller';
import { CratesService } from './crates.service';

@Global()
@Module({
  controllers: [CratesController],
  providers: [CratesService],
  exports: [CratesService],
})
export class CratesModule {}
