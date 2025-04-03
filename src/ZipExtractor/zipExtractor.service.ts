import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MailerService } from '../Mailer/mailer.service';
import { SendMailDto } from '../Mailer/MailerDtos/mailer.dto';
// import * as mime from 'mime-types';

@Injectable()
export class ZipExtractService {
  private readonly logger = new Logger(ZipExtractService.name);
  private supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
  );
  private bucketName = process.env.SUPABASE_BUCKET_NAME;
  constructor(private readonly mailerService: MailerService) {}
  async extractAndUploadZip(url: string, userEmail: string) {
    try {
      this.logger.log(`Downloading ZIP from: ${url}`);

      // Download the file from the URL
      const response = await axios.get(url, { responseType: 'arraybuffer' });

      if (!response || response.status !== 200) {
        this.logger.error(
          `Failed to download ZIP file. Status: ${response.status}`,
        );
        return { error: 'Failed to download ZIP file.' };
      }

      const fileSizeKB = Math.round(response.data.byteLength / 1024); // Size in KB
      this.logger.log(`Downloaded file size: ${fileSizeKB} KB`);

      // Check if the file is empty or too small
      if (fileSizeKB === 0) {
        await this.sendErrorEmail(
          userEmail,
          url,
          'The ZIP file uplaoded is empty (0 KB). Please try again!',
        );
        return { error: 'The ZIP file is empty (0 KB).' };
      }

      if (fileSizeKB > 300) {
        await this.sendErrorEmail(
          userEmail,
          url,
          'he ZIP file uplaoded is too large (more than 300 KB). Please try again!',
        );
        // 300 KB threshold
        return { error: 'The ZIP file is too large (more than 300 KB).' };
      }

      // Check if the file is actually a ZIP file based on its magic number (PK)
      if (!this.isZipFile(response.data)) {
        await this.sendErrorEmail(
          userEmail,
          url,
          'he ZIP file uplaoded is not a valid zip file. Please try again!',
        );
        return { error: 'The file is not a valid ZIP file.' };
      }

      // Extract ZIP
      const zip = new AdmZip(response.data);
      const zipEntries = zip.getEntries();

      this.logger.log(`Extracted ${zipEntries.length} files from ZIP.`);

      const uploadedFiles = await Promise.all(
        zipEntries.map(async (entry) => {
          if (entry.isDirectory) return null; // Skip directories

          const fileName = entry.entryName;
          const fileExt = fileName.split('.').pop() || 'unknown';
          const fileBuffer = entry.getData();

          // Upload to Supabase Storage
          const { error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(`extracted/${fileName}`, fileBuffer, {
              contentType: `application/octet-stream`,
              upsert: true,
            });

          if (error) {
            this.logger.error(`Failed to upload ${fileName}: ${error.message}`);
            return null;
          }

          // Generate a signed URL (valid for 1 hour)
          const { data, error: signedUrlError } = await this.supabase.storage
            .from(this.bucketName)
            .createSignedUrl(`extracted/${fileName}`, 60 * 60);

          if (signedUrlError) {
            this.logger.error(
              `Failed to generate signed URL for ${fileName}: ${signedUrlError.message}`,
            );
            return null;
          }

          // Return the file information in the requested format
          return {
            FileName: fileName,
            FileExt: fileExt,
            Url: data.signedUrl, // URL to download file
          };
        }),
      );

      // Filter out failed uploads
      const files = uploadedFiles.filter((file) => file !== null);

      // Return the response in the format you're looking for
      return { Files: files };
    } catch (error) {
      this.logger.error(`Error extracting ZIP: ${error.message}`);
      return { error: `ZIP extraction failed: ${error.message}` };
    }
  }

  private async sendErrorEmail(
    userEmail: string,
    zipUrl: string,
    errorMessage: string,
  ) {
    const mailDto: SendMailDto = {
      receiver: userEmail,
      subject: 'ZIP Extraction Failed',
      emailBody: `<p>Dear Customer,</p>
                  <p>Unfortunately, your ZIP extraction request has failed.</p>
                  <p><strong>Error Details:</strong> ${errorMessage}</p>
                  <p><strong>ZIP File URL:</strong> <a href="${zipUrl}">${zipUrl}</a></p>
                  <p>Please try again or contact support for assistance.</p>
                  <p>Best Regards,</p>
                  <p>Your Support Team</p>`,
      cc: [], // Ensure optional fields are included
      bcc: [],
    };

    const result = await this.mailerService.sendMail(mailDto);

    if (!result.success) {
      this.logger.error(
        `Failed to send error notification email: ${result.error}`,
      );
    } else {
      this.logger.log(`Error notification email sent to ${userEmail}`);
    }
  }

  private isZipFile(data: Buffer): boolean {
    // The magic number for ZIP files is 'PK'
    const magicNumber = data.slice(0, 2).toString('utf8');
    return magicNumber === 'PK'; // ZIP file signature is 'PK'
  }
}
