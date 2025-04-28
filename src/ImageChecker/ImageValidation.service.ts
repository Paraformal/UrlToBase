import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import AdmZip from 'adm-zip';
import { LoggerService } from '../Utils/logger.service';

@Injectable()
export class ImageValidationService {
  constructor(private readonly logger: LoggerService) {}

  async validateImagesFromZip(zip: AdmZip): Promise<
    Array<{
      check: string;
      success: boolean;
      errors: string[];
    }>
  > {
    const results = [];

    try {
      const zipEntries = zip.getEntries();

      const imageEntries = zipEntries.filter((entry) => {
        const name = entry.entryName.toLowerCase();
        return (
          !entry.isDirectory &&
          (name.endsWith('.png') ||
            name.endsWith('.jpg') ||
            name.endsWith('.jpeg') ||
            name.endsWith('.gif') ||
            name.endsWith('.webp'))
        );
      });

      if (imageEntries.length === 0) {
        results.push({
          check: 'ZIP Content',
          success: false,
          errors: ['No images found in the ZIP file ❌'],
        });
        return results;
      }

      for (const entry of imageEntries) {
        const errors = [];
        let success = true;

        try {
          const imageBuffer = entry.getData();
          await this.checkImageDimensionsAndDPI(
            imageBuffer,
            entry.entryName,
            errors,
          );
        } catch (error) {
          success = false;
          errors.push(error.message);
        }

        if (errors.length === 0) {
          errors.push('Image passed all validations ✅');
        }

        results.push({
          check: entry.entryName,
          success,
          errors,
        });
      }

      return results;
    } catch (error) {
      return [
        {
          check: 'ZIP Processing',
          success: false,
          errors: [error.message],
        },
      ];
    }
  }

  private async checkImageDimensionsAndDPI(
    imageBuffer: Buffer,
    imageName: string,
    errors: string[],
  ): Promise<void> {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (metadata.width && metadata.width > 600) {
      errors.push(
        `Image width exceeds 600 pixels ❌ (found ${metadata.width}px)`,
      );
    }

    if (metadata.density && metadata.density !== 72) {
      errors.push(`Image DPI is not 72 ❌ (found ${metadata.density})`);
    }

    if (errors.length === 0) {
      this.logger.log(
        `✅ Image validated: ${imageName}, Width: ${metadata.width}px, DPI: ${metadata.density}`,
      );
    } else {
      this.logger.error(
        `Image validation failed for ${imageName}: ${errors.join(', ')}`,
      );
      throw new Error(errors.join(' | '));
    }
  }
}
