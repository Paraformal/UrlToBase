import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendMailDto {
  @IsEmail()
  receiver: string;

  @IsString()
  subject: string;

  @IsOptional()
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsString()
  emailBody: string;
}
