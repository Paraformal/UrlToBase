import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class ExtractZipDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsEmail()
  @IsNotEmpty()
  userEmail: string;
}
