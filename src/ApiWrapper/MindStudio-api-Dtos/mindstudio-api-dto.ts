// src/mindstudio-upload/dto/mindstudio-upload.dto.ts

import { IsEmail, IsString } from 'class-validator';

export class MindstudioUploadDto {
  @IsEmail()
  email: string;

  @IsString()
  attachment: string;
}
