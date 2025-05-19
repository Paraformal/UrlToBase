import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import AdmZip from 'adm-zip';
import { LoggerService } from '../Utils/logger.service';
import { ResizeResult } from 'src/Utils/resizeImage';

@Injectable()
export class ImageValidationService {
  constructor(private readonly logger: LoggerService) {}

  async validateImagesFromZip(
    zip: AdmZip,
    resized: boolean = false, // new parameter with default false
    resizeResult?: ResizeResult,
  ): Promise<
    Array<{
      check: string;
      success: boolean;
      errors: string[];
      resized: boolean; // add resized field in return type
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
          resized,
        });
        return results;
      }

      for (const entry of imageEntries) {
        const imageName = entry.entryName;
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

        const resizeInfo = resizeResult?.resizedImagesMap?.[imageName];
        console.log(
          `BABABABABABAB [ImageValidationService] Resize info for ${imageName}:`,
          resizeInfo,
        );

        if (resizeInfo) {
          errors.push(
            `Original: ${resizeInfo.originalWidth}x${resizeInfo.originalHeight}px, ${(resizeInfo.originalSize / 1024).toFixed(1)}KB, Format: ${resizeInfo.originalFormat ?? 'unknown'}, Channels: ${resizeInfo.originalChannels ?? 'unknown'}, Depth: ${resizeInfo.originalDepth ?? 'unknown'}, DPI: ${resizeInfo.originalDensity ?? 'unknown'}`,
            `Resized: ${resizeInfo.newWidth}x${resizeInfo.newHeight}px, ${(resizeInfo.newSize / 1024).toFixed(1)}KB, Format: ${resizeInfo.newFormat ?? 'unknown'}, Channels: ${resizeInfo.newChannels ?? 'unknown'}, Depth: ${resizeInfo.newDepth ?? 'unknown'}, DPI: ${resizeInfo.newDensity ?? 'unknown'}`,
          );
        }

        if (errors.length === 0) {
          errors.push('Image passed all validations ✅');
        }

        results.push({
          check: entry.entryName,
          success,
          errors,
          resized, // set resized flag here
        });
      }

      return results;
    } catch (error) {
      return [
        {
          check: 'ZIP Processing',
          success: false,
          errors: [error.message],
          resized,
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
