import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class FileDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  url: string;
}
