import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { LoggerService } from '../Utils/logger.service';

@Injectable()
export class UrlToBaseService {
  constructor(private readonly logger: LoggerService) {}

  async downloadAndConvertToBase64(url: string): Promise<{ base64: string }> {
    try {
      this.logger.log(`Received request to download: ${url}`);

      // Download the file
      const response = await axios.get(url, { responseType: 'arraybuffer' });

      if (!response || response.status !== 200) {
        this.logger.error(`Failed to download file: ${url}`);
        throw new Error('File download failed.');
      }

      this.logger.log(`Successfully downloaded file from: ${url}`);

      // Convert to Base64
      const base64String = Buffer.from(response.data).toString('base64');

      this.logger.log(`File successfully converted to Base64.`);

      return { base64: base64String };
    } catch (error) {
      this.logger.error(`Error processing file from ${url}: ${error.message}`);
      throw new Error(`File processing failed: ${error.message}`);
    }
  }
}
