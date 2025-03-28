import { IsString } from 'class-validator';

export class ValidateImageDto {
  @IsString()
  url: string;
}
