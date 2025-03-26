import { Controller, Post, Body } from '@nestjs/common';
import { UrlToBaseService } from './urlToBase.service';
import { LoggerService } from '../Utils/logger.service';
import { FileDto } from './urlToBaseDto/urlToBase.dto';

@Controller('api/ntg-ms/convert')
export class UrlToBaseController {
  constructor(
    private readonly fileService: UrlToBaseService,
    private readonly logger: LoggerService,
  ) {}

  @Post('url/to/base64/convert')
  async convertFile(@Body() fileDto: FileDto) {
    const { url } = fileDto;

    this.logger.log(`Processing request for URL: ${url}`);

    return await this.fileService.downloadAndConvertToBase64(url);
  }
}
