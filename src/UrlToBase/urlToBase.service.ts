import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { LoggerService } from '../Utils/logger.service';
import * as mime from 'mime-types';

@Injectable()
export class UrlToBaseService {
  constructor(private readonly logger: LoggerService) {}

  async downloadAndConvertToBase64(
    url: string,
  ): Promise<{ base64: string; size: number; fileType: string }> {
    try {
      this.logger.log(`Received request to download: ${url}`);

      // Download the file
      const response = await axios.get(url, { responseType: 'arraybuffer' });

      if (!response || response.status !== 200) {
        this.logger.error(`Failed to download file: ${url}`);
        throw new Error('File download failed.');
      }

      // Get file size in KB
      const fileSizeKB = Math.round(response.data.byteLength / 1024);
      this.logger.log(`Downloaded file size: ${fileSizeKB} KB`);

      // Check content type and file extension
      const contentType = response.headers['content-type'];
      const mimeType =
        mime.lookup(url) || contentType || 'application/octet-stream'; // Default to binary file
      const fileExtension = mime.extension(mimeType);

      // Check if the file is a ZIP based on MIME type and magic number
      const isZipFile = this.isZipFile(response.data);

      let fileType = 'other';
      if (isZipFile) {
        fileType = 'zip';
      } else {
        fileType = fileExtension || 'unknown';
      }

      this.logger.log(`Detected file type: ${fileType}`);

      // Convert to Base64
      const base64String = Buffer.from(response.data).toString('base64');
      this.logger.log(`File successfully converted to Base64.`);

      return { base64: base64String, size: fileSizeKB, fileType };
    } catch (error) {
      this.logger.error(`Error processing file from ${url}: ${error.message}`);
      throw new Error(`File processing failed: ${error.message}`);
    }
  }

  private isZipFile(data: Buffer): boolean {
    // The magic number for ZIP files is 'PK'
    const magicNumber = data.slice(0, 2).toString('utf8');
    return magicNumber === 'PK';
  }
}
