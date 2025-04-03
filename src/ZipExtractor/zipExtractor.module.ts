import { Module } from '@nestjs/common';
import { ZipExtractService } from './zipExtractor.service';
import { ZipExtractController } from './zipExtractor.controller';
import { MailerService } from 'src/Mailer/mailer.service';
import { ConfigModule } from '@nestjs/config';
import mailConfig from '../Mailer/mail.config';

@Module({
  imports: [ConfigModule.forRoot({ load: [mailConfig] })],
  controllers: [ZipExtractController],
  providers: [ZipExtractService, MailerService],
})
export class ZipExtractModule {}
