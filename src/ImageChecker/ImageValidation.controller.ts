import { Controller, Post, Body } from '@nestjs/common';
import { ImageValidationService } from './ImageValidation.service';
import { ValidateImageDto } from './ImageValidation_Dto/ImageValidation.dto';
import { LoggerService } from '../utils/logger.service';

@Controller('api/ntg-ms/image/')
export class ImageValidationController {
  constructor(
    private readonly imageValidationService: ImageValidationService,
    private readonly logger: LoggerService,
  ) {}

  @Post('validate')
  async validateImage(@Body() validateImageDto: ValidateImageDto) {
    if (!validateImageDto.url) {
      this.logger.error('Request missing URL.');
      return { error: 'URL is required' };
    }

    this.logger.log(
      `Processing request for image URL: ${validateImageDto.url}`,
    );

    try {
      const result =
        await this.imageValidationService.validateImage(validateImageDto);
      if (result.valid) {
        return { message: 'Image is valid ✅' };
      } else {
        return { error: result.errorMessage };
      }
    } catch (error) {
      this.logger.error(`Image validation failed: ${error.message}`);
      return { error: error.message };
    }
  }
}
