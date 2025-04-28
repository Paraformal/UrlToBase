import { Module } from '@nestjs/common';
import { ZipExtractService } from './zipExtractor.service';
import { ZipExtractController } from './zipExtractor.controller';
import { MailerService } from 'src/Mailer/mailer.service';
import { ConfigModule } from '@nestjs/config';
import mailConfig from '../Mailer/mail.config';
import { ImageValidationModule } from 'src/ImageChecker/ImageValidation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ load: [mailConfig] }),
    ImageValidationModule,
  ],
  controllers: [ZipExtractController],
  providers: [ZipExtractService, MailerService],
})
export class ZipExtractModule {}
