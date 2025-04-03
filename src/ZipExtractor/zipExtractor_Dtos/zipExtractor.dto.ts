import { IsString, IsNotEmpty } from 'class-validator';

export class ExtractZipDto {
  @IsString()
  @IsNotEmpty()
  url: string;
}
