import { Controller, Post, Body } from '@nestjs/common';
import { ImageValidationService } from './ImageValidation.service';
import { LoggerService } from '../Utils/logger.service';
import AdmZip from 'adm-zip';

@Controller('api/ntg-ms/image/')
export class ImageValidationController {
  constructor(
    private readonly imageValidationService: ImageValidationService,
    private readonly logger: LoggerService,
  ) {}

  @Post('validate-zip')
  async validateZip(@Body() body: { base64Zip: string }) {
    if (!body.base64Zip) {
      return { error: 'base64Zip is required' };
    }

    try {
      const buffer = Buffer.from(body.base64Zip, 'base64');
      const zip = new AdmZip(buffer);
      const results =
        await this.imageValidationService.validateImagesFromZip(zip);

      return {
        success: results.every((r) => r.success),
        results,
      };
    } catch (error) {
      this.logger.error(`ZIP image validation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
