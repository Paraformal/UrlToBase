import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
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

  async extractAndUploadZip(url: string, userEmail: string) {
    try {
      this.logger.log(`Downloading ZIP from: ${url}`);

      const response = await axios.get(url, { responseType: 'arraybuffer' });

      if (!response || response.status !== 200) {
        this.logger.error(
          `Failed to download ZIP file. Status: ${response.status}`,
        );
        return { error: 'Failed to download ZIP file.' };
      }

      const fileSizeKB = Math.round(response.data.byteLength / 1024);
      this.logger.log(`Downloaded file size: ${fileSizeKB} KB`);

      if (fileSizeKB === 0) {
        await this.sendErrorEmail(
          userEmail,
          url,
          'The ZIP file uploaded is empty (0 KB). Please try again!',
        );
        return { error: 'The ZIP file is empty (0 KB).' };
      }

      if (fileSizeKB > 300) {
        await this.sendErrorEmail(
          userEmail,
          url,
          'The ZIP file uploaded is too large (more than 300 KB). Please try again!',
        );
        return { error: 'The ZIP file is too large (more than 300 KB).' };
      }

      if (!this.isZipFile(response.data)) {
        await this.sendErrorEmail(
          userEmail,
          url,
          'The ZIP file uploaded is not a valid zip file. Please try again!',
        );
        return { error: 'The file is not a valid ZIP file.' };
      }

      const zip = new AdmZip(response.data);
      const zipEntries = zip.getEntries();
      this.logger.log(`Extracted ${zipEntries.length} files from ZIP.`);

      // // Checking for disallowed scripts and plugins in HTML files
      // const pluginCheck = checkScriptsAndPluginsNotAllowed(zip);
      // if (!pluginCheck.success) {
      //   const pluginErrors = pluginCheck.errors.join('<br/>');
      //   await this.sendErrorEmail(
      //     userEmail,
      //     url,
      //     `Disallowed scripts/plugins found:<br/>${pluginErrors}`,
      //   );
      //   return {
      //     error: 'Disallowed scripts or plugins in ZIP HTML.',
      //     details: pluginCheck.errors,
      //   };
      // }

      // // Checking for <map> tag and CSS rules in HTML and CSS files

      // const htmlCssCheck = checkMapTagAndCssRules(zip);
      // if (!htmlCssCheck.success) {
      //   const ruleErrors = htmlCssCheck.errors.join('<br/>');
      //   await this.sendErrorEmail(
      //     userEmail,
      //     url,
      //     `Disallowed HTML or CSS rules found:<br/>${ruleErrors}`,
      //   );
      //   return {
      //     error: 'Disallowed HTML/CSS rules in ZIP.',
      //     details: htmlCssCheck.errors,
      //   };
      // }

      // // Checking for nested background styles, videos, images

      // const bgStyleCheck = checkBackgroundStyles(zip);
      // if (!bgStyleCheck.success) {
      //   const bgErrors = bgStyleCheck.errors.join('<br/>');
      //   await this.sendErrorEmail(
      //     userEmail,
      //     url,
      //     `Background styling violations found:<br/>${bgErrors}`,
      //   );
      //   return {
      //     error: 'Background styling issues in ZIP HTML/CSS.',
      //     details: bgStyleCheck.errors,
      //   };
      // }

      // // Checking for embedded videos in HTML files

      // const htmlEntry = zipEntries.find((entry) =>
      //   entry.entryName.toLowerCase().endsWith('.html'),
      // );

      // if (htmlEntry) {
      //   const htmlContent = htmlEntry.getData().toString('utf8');

      //   const videoCheckResult = checkEmbeddedVideosInHtml(htmlContent);
      //   // console.log(
      //   //   `Embedded video check result: ${JSON.stringify(videoCheckResult)}`,
      //   // );
      //   if (!videoCheckResult.success) {
      //     const videoErrors = videoCheckResult.errors.join('<br/>');

      //     await this.sendErrorEmail(
      //       userEmail,
      //       url,
      //       `Embedded video found in HTML. Please use a static preview image linking to an external site (e.g., YouTube or Vimeo).<br/>${videoErrors}`,
      //     );

      //     return {
      //       error:
      //         'Embedded video found in HTML. Static preview image required.',
      //       details: videoCheckResult.errors,
      //     };
      //   }
      // }

      // // Checking if image dimensions in HTML match actual image dimensions in ZIP

      // const dimensionCheck = checkImageDimensionsMatchHtml(zip);
      // if (!dimensionCheck.success) {
      //   const dimensionErrors = dimensionCheck.errors.join('<br/>');

      //   await this.sendErrorEmail(
      //     userEmail,
      //     url,
      //     `Image dimension mismatch found:<br/>${dimensionErrors}`,
      //   );

      //   return {
      //     error: 'Image dimension mismatch in ZIP HTML.',
      //     details: dimensionCheck.errors,
      //   };
      // }

      // ✅ Proceed with uploading

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
              `Failed to generate signed URL for ${fileName}: ${JSON.stringify(
                signedUrlError,
                null,
                2,
              )}`,
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
