import { Injectable, Logger } from '@nestjs/common';
// import axios from 'axios';
import * as AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MailerService } from '../Mailer/mailer.service';
import { SendMailDto } from '../Mailer/MailerDtos/mailer.dto';
import { checkImageDimensionsMatchHtml } from '../Utils/checkImageDimensionsMatchHtml';
import { checkEmbeddedVideosInHtml } from '../Utils/checkEmbeddedVideosInHtml';
import { checkMapTagAndCssRules } from '../Utils/checkMapTagAndCssRules';
import { checkBackgroundStyles } from '../Utils/checkBackgroundStyles';
import { checkScriptsAndPluginsNotAllowed } from '../Utils/checkScriptsAndPluginsNotAllowed';

@Injectable()
export class ZipExtractService {
  private readonly logger = new Logger(ZipExtractService.name);
  private supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
  );
  private bucketName = process.env.SUPABASE_BUCKET_NAME;

  constructor(private readonly mailerService: MailerService) {}

  async extractAndUploadZip(base64Zip: string, userEmail: string) {
    try {
      this.logger.log(`Received ZIP file in base64 format`);

      let buffer: Buffer;
      try {
        buffer = Buffer.from(base64Zip, 'base64');
      } catch (err) {
        this.logger.error(`Invalid base64 input`);
        return { error: 'Invalid base64 ZIP file.' };
      }

      const fileSizeKB = Math.round(buffer.byteLength / 1024);
      this.logger.log(`Received file size: ${fileSizeKB} KB`);

      if (fileSizeKB === 0) {
        await this.sendErrorEmail(
          userEmail,
          'The ZIP file uploaded is empty (0 KB). Please try again!',
        );
        return { error: 'The ZIP file is empty (0 KB).' };
      }

      if (fileSizeKB > 300) {
        await this.sendErrorEmail(
          userEmail,
          'The ZIP file uploaded is too large (more than 300 KB). Please try again!',
        );
        return { error: 'The ZIP file is too large (more than 300 KB).' };
      }

      if (!this.isZipFile(buffer)) {
        await this.sendErrorEmail(
          userEmail,
          'The ZIP file uploaded is not a valid zip file. Please try again!',
        );
        return { error: 'The file is not a valid ZIP file.' };
      }

      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      this.logger.log(`Extracted ${zipEntries.length} files from ZIP.`);

      // 🧠 Collect all validation issues
      const allErrors: string[] = [];

      const pluginCheck = checkScriptsAndPluginsNotAllowed(zip);
      if (!pluginCheck.success) {
        allErrors.push(
          `Disallowed scripts/plugins found:<br/>${pluginCheck.errors.join('<br/>')}`,
        );
      }

      const htmlCssCheck = checkMapTagAndCssRules(zip);
      if (!htmlCssCheck.success) {
        allErrors.push(
          `Disallowed HTML or CSS rules found:<br/>${htmlCssCheck.errors.join('<br/>')}`,
        );
      }

      const bgStyleCheck = checkBackgroundStyles(zip);
      if (!bgStyleCheck.success) {
        allErrors.push(
          `Background styling violations found:<br/>${bgStyleCheck.errors.join('<br/>')}`,
        );
      }

      const htmlEntry = zipEntries.find((entry) =>
        entry.entryName.toLowerCase().endsWith('.html'),
      );

      if (htmlEntry) {
        const htmlContent = htmlEntry.getData().toString('utf8');
        const videoCheckResult = checkEmbeddedVideosInHtml(htmlContent);
        if (!videoCheckResult.success) {
          allErrors.push(
            `Embedded video found in HTML. Please use a static preview image linking to an external site (e.g., YouTube or Vimeo).<br/>${videoCheckResult.errors.join('<br/>')}`,
          );
        }
      }

      const dimensionCheck = checkImageDimensionsMatchHtml(zip);
      if (!dimensionCheck.success) {
        allErrors.push(
          `Image dimension mismatch found:<br/>${dimensionCheck.errors.join('<br/>')}`,
        );
      }

      // ❌ Send summary email if any failed
      if (allErrors.length > 0) {
        const combinedMessage = allErrors.join('<br/><br/>');
        await this.sendErrorEmail(userEmail, combinedMessage);
        return { error: 'Validation failed.', details: allErrors };
      }

      // ✅ Proceed with upload
      const uploadedFiles = await Promise.all(
        zipEntries.map(async (entry) => {
          if (entry.isDirectory) return null;

          const fullPath = entry.entryName;
          const fileName = fullPath.split('/').pop() || fullPath;
          const fileExt = fileName.split('.').pop() || 'unknown';
          const fileBuffer = entry.getData();

          if (!fileName || !fileBuffer?.length) {
            this.logger.warn(`Skipping invalid or empty file: ${fileName}`);
            return null;
          }

          const uploadPath = `extracted/${fileName}`;

          const { error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(uploadPath, fileBuffer, {
              contentType: 'application/octet-stream',
              upsert: true,
            });

          if (error) {
            this.logger.error(
              `Failed to upload ${fileName}: ${JSON.stringify(error, null, 2)}`,
            );
            return null;
          }

          const { data, error: signedUrlError } = await this.supabase.storage
            .from(this.bucketName)
            .createSignedUrl(uploadPath, 60 * 60); // 1 hour

          if (signedUrlError) {
            this.logger.error(
              `Failed to generate signed URL for ${fileName}: ${JSON.stringify(signedUrlError, null, 2)}`,
            );
            return null;
          }

          return {
            FileName: fileName,
            FileExt: fileExt,
            Url: data.signedUrl,
          };
        }),
      );

      const files = uploadedFiles.filter((file) => file !== null);
      return { Files: files };
    } catch (error) {
      this.logger.error(`Error extracting ZIP: ${error.message}`);
      return { error: `ZIP extraction failed: ${error.message}` };
    }
  }

  private async sendErrorEmail(userEmail: string, errorMessage: string) {
    const mailDto: SendMailDto = {
      receiver: userEmail,
      subject: 'ZIP Extraction Failed',
      emailBody: `<p>Dear Customer,</p>
                  <p>Unfortunately, your ZIP extraction request has failed.</p>
                  <p><strong>Error Details:</strong> ${errorMessage}</p>
                  <p>Please try again or contact support for assistance.</p>
                  <p>Best Regards,</p>
                  <p>Your Support Team</p>`,
      cc: [],
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
    const magicNumber = data.slice(0, 2).toString('utf8');
    return magicNumber === 'PK';
  }
}
