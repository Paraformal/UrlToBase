import { Module } from '@nestjs/common';
import { ZipExtractService } from './zipExtractor.service';
import { ZipExtractController } from './zipExtractor.controller';

@Module({
  controllers: [ZipExtractController],
  providers: [ZipExtractService],
})
export class ZipExtractModule {}
