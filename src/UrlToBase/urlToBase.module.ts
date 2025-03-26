import { Module } from '@nestjs/common';
import { UrlToBaseController } from './urlToBase.controller';
import { UrlToBaseService } from './urlToBase.service';
import { LoggerService } from '../Utils/logger.service';

@Module({
  controllers: [UrlToBaseController],
  providers: [UrlToBaseService, LoggerService],
  exports: [UrlToBaseService],
})
export class UrlToBaseModule {}
