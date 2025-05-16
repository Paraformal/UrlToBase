import { Module } from '@nestjs/common';
import { LoggerService } from './Utils/logger.service';
import { MailerModule } from './Mailer/mailer.module';
import { ImageValidationModule } from './ImageChecker/ImageValidation.module';
import { ZipExtractModule } from './ZipExtractor/zipExtractor.module';
import { MindstudioUploadModule } from './ApiWrapper/mindstudio-upload.module';
import { LogsModule } from './logsRoutes/logs.module';

@Module({
  imports: [
    MailerModule,
    ImageValidationModule,
    ZipExtractModule,
    MindstudioUploadModule,
    LogsModule,
  ],
  providers: [LoggerService],
})
export class AppModule {}
