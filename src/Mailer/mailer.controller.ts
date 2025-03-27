import { Controller, Post, Body } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { SendMailDto } from './MailerDtos/mailer.dto';

@Controller('mail')
export class MailerController {
  constructor(private readonly mailerService: MailerService) {}

  @Post('send')
  async sendMail(@Body() sendMailDto: SendMailDto) {
    return this.mailerService.sendMail(sendMailDto);
  }
}
