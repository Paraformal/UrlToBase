import { Module } from '@nestjs/common';
import { UrlToBaseModule } from './UrlToBase_Deprecated/urlToBase.module';
import { LoggerService } from './Utils/logger.service';
import { MailerModule } from './Mailer/mailer.module';
import { ImageValidationModule } from './ImageChecker/ImageValidation.module';
import { ZipExtractModule } from './ZipExtractor/zipExtractor.module';

@Module({
  imports: [
    UrlToBaseModule,
    MailerModule,
    ImageValidationModule,
    ZipExtractModule,
  ],
  providers: [LoggerService],
})
export class AppModule {}
