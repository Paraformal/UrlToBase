import { Module } from '@nestjs/common';
import { UrlToBaseModule } from './UrlToBase/urlToBase.module';
import { LoggerService } from './Utils/logger.service';
import { MailerModule } from './Mailer/mailer.module';

@Module({
  imports: [UrlToBaseModule, MailerModule],
  providers: [LoggerService],
})
export class AppModule {}
