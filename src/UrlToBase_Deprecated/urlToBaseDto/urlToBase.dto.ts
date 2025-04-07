import { IsString, IsNotEmpty } from 'class-validator';

export class FileDto {
  @IsString()
  @IsNotEmpty()
  // @IsUrl()
  url: string;
}
