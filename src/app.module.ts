import { Module } from '@nestjs/common';
import { UrlToBaseModule } from './UrlToBase/urlToBase.module';
import { LoggerService } from './Utils/logger.service';

@Module({
  imports: [UrlToBaseModule],
  providers: [LoggerService],
})
export class AppModule {}
