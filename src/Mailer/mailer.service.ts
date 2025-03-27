import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SendMailDto } from './MailerDtos/mailer.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailerService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('mailer.host'),
      port: this.configService.get<number>('mailer.port'),
      secure: this.configService.get<boolean>('mailer.secure'),
      auth: {
        user: this.configService.get<string>('mailer.auth.user'),
        pass: this.configService.get<string>('mailer.auth.pass'),
      },
    });
  }

  async sendMail(
    mailDto: SendMailDto,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const mailOptions = {
        from: this.configService.get<string>('mailer.auth.user'),
        to: mailDto.receiver,
        subject: mailDto.subject,
        cc: mailDto.cc && mailDto.cc.length ? mailDto.cc.join(',') : undefined,
        bcc:
          mailDto.bcc && mailDto.bcc.length ? mailDto.bcc.join(',') : undefined,
        text: mailDto.emailBody,
        html: mailDto.emailBody, // Supports both plain text & HTML
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
