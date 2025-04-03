import { Injectable } from '@nestjs/common';
import axios from 'axios';
// import * as mime from 'mime-types';
import * as sharp from 'sharp';
import { LoggerService } from '../Utils/logger.service';
import { ValidateImageDto } from './ImageValidation_Dto/ImageValidation.dto';

@Injectable()
export class ImageValidationService {
  constructor(private readonly logger: LoggerService) {}

  async validateImage(
    createFileDto: ValidateImageDto,
  ): Promise<{ valid: boolean; errorMessage?: string }> {
    try {
      const { url } = createFileDto;

      // this.logger.log(`Received request to validate image: ${url}`);

      // Download the file
      const response = await axios.get(url, { responseType: 'arraybuffer' });

      if (!response || response.status !== 200) {
        this.logger.error(`Failed to download image: ${url}`);
        throw new Error('Image download failed.');
      }

      // // Get file extension and content type
      // const mimeType = mime.lookup(url);
      // const fileExtension = mime.extension(
      //   mimeType || 'application/octet-stream',
      // );

      // // Check if the file is an image
      // if (!['jpeg', 'jpg', 'png'].includes(fileExtension)) {
      //   this.logger.error('File is not an image');
      //   return { valid: false, errorMessage: 'File is not an image' };
      // }

      // Validate image width and DPI
      await this.checkImageDimensionsAndDPI(response.data);

      return { valid: true };
    } catch (error) {
      return { valid: false, errorMessage: error.message };
    }
  }

  private async checkImageDimensionsAndDPI(imageBuffer: Buffer): Promise<void> {
    try {
      // Use Sharp to analyze the image
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      // Check if the image width exceeds 600 pixels
      if (metadata.width && metadata.width > 600) {
        throw new Error('Image width exceeds 600 pixels ❌');
      }

      // Check if the DPI is 72 (Sharp provides this information in the metadata)
      if (metadata.density && metadata.density !== 72) {
        throw new Error('Image DPI is not 72 ❌');
      }

      this.logger.log(
        `Image validated: Width is ${metadata.width}px, DPI is ${metadata.density}`,
      );
    } catch (error) {
      this.logger.error(`Image validation failed: ${error.message}`);
      throw new Error(`Image validation failed: ${error.message}`);
    }
  }
}
