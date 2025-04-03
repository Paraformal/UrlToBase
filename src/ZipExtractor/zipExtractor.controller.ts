import { Controller, Post, Body } from '@nestjs/common';
import { ZipExtractService } from './zipExtractor.service';
import { ExtractZipDto } from './zipExtractor_Dtos/zipExtractor.dto';

@Controller('api/ntg-ms/convert')
export class ZipExtractController {
  constructor(private readonly zipExtractService: ZipExtractService) {}

  @Post('extract/zip')
  async extractZip(@Body() { url }: ExtractZipDto) {
    return this.zipExtractService.extractAndUploadZip(url);
  }
}
