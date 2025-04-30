/*
### ✅ **Static Errors You Handle**
These are the ones hardcoded in your service logic.

| **Error Trigger** | **Technical Message** | **User-Friendly Message** |
|------------------|------------------------|----------------------------|
| Invalid base64 input | `Invalid base64 ZIP file.` | "The uploaded file is not a valid ZIP. Please re-upload it." |
| File size = 0 KB | `The ZIP file is empty (0 KB).` | "The ZIP file you uploaded is empty. Please check the file and try again." |
| File size > 300 KB | `The ZIP file is too large (more than 300 KB).` | "The ZIP file is too large. Please upload a file smaller than 300 KB." |
| Not a valid zip (magic number check) | `The file is not a valid ZIP file.` | "The uploaded file format is incorrect. Please upload a proper .zip file." |
| ZIP extraction failed (general catch-all) | `ZIP extraction failed: ${error.message}` | "Something went wrong while extracting your file. Please try again later." |

---

### ✅ **Validation Errors from Utility Checks**

| **Check** | **Sample Technical Message** | **User-Friendly Message** |
|----------|-------------------------------|----------------------------|
| `checkScriptsAndPluginsNotAllowed` | `Disallowed scripts/plugins found:<br/>script.js found in /assets/js/` | "Your ZIP file includes scripts or plugins which are not allowed. Please remove them and try again." |
| `checkMapTagAndCssRules` | `Disallowed HTML or CSS rules found:<br/><map> tag used in page.html` | "Some HTML or CSS content is not allowed in your ZIP. Please adjust your code and try again." |
| `checkBackgroundStyles` | `Background styling violations found:<br/>Inline background image in style.css` | "Background styles in your ZIP aren't allowed. Use simpler designs and try again." |
| `checkEmbeddedVideosInHtml` | `Embedded video found in HTML.<br/>Found iframe linking to YouTube.` | "Embedded videos aren't allowed. Please use an image that links to the video externally instead." |
| `checkImageDimensionsMatchHtml` | `Image dimension mismatch found:<br/>Image 'hero.png' does not match HTML-specified dimensions.` | "One or more images in your ZIP do not match the size defined in the HTML. Please fix and re-upload." |

---

### ✅ **Upload Errors (to Supabase)**

| **Error Trigger** | **Technical Message** | **User-Friendly Message** |
|------------------|------------------------|----------------------------|
| Failed to upload error log | `Failed to upload error log` | "We couldn't save the validation report. Please try again later or contact support." |
| Failed to create signed URL | `Failed to create signed URL for error log` | "An internal error occurred while generating your error log link. Please try again later." |
| File upload failed (individual files) | `Failed to upload ${fileName}` | "An error occurred while uploading a file from your ZIP. Please try again." |
| Failed to generate signed URL for file | `Failed to generate signed URL for ${fileName}` | "We couldn’t generate a preview link for one of your files. Please try again later." |
**/

import { Injectable, Logger } from '@nestjs/common';
import * as AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MailerService } from '../Mailer/mailer.service';
import { SendMailDto } from '../Mailer/MailerDtos/mailer.dto';
import { checkImageDimensionsMatchHtml } from '../Utils/checkImageDimensionsMatchHtml';
import { checkEmbeddedVideosInHtml } from '../Utils/checkEmbeddedVideosInHtml';
import { checkMapTagAndCssRules } from '../Utils/checkMapTagAndCssRules';
import { checkBackgroundStyles } from '../Utils/checkBackgroundStyles';
import { checkScriptsAndPluginsNotAllowed } from '../Utils/checkScriptsAndPluginsNotAllowed';
import { ImageValidationService } from 'src/ImageChecker/ImageValidation.service';
import { runSpecificHtmlValidations } from 'src/Utils/v1_htmlChecks';
import { resizeImagesInZip } from 'src/Utils/resizeImage';
import { inlineExternalCssInZip } from 'src/Utils/inlineExternalCssInZip';

@Injectable()
export class ZipExtractService {
  private readonly logger = new Logger(ZipExtractService.name);
  private supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
  );
  private bucketName = process.env.SUPABASE_BUCKET_NAME;

  constructor(
    private readonly mailerService: MailerService,
    private readonly imageValidationService: ImageValidationService,
  ) {}

  async extractAndUploadZip(base64Zip: string, userEmail: string) {
    try {
      this.logger.log(`Received ZIP file in base64 format`);

      let buffer: Buffer;
      try {
        buffer = Buffer.from(base64Zip, 'base64');
      } catch (err) {
        this.logger.error(`Invalid base64 input`);
        return { success: false, cases: {}, error: 'Invalid base64 ZIP file.' };
      }

      let zip = new AdmZip(buffer);
      let fileSizeKB = Math.round(buffer.byteLength / 1024);
      this.logger.log(`Received file size: ${fileSizeKB} KB`);

      // Special: if >300KB, attempt resizing
      if (fileSizeKB > 300) {
        this.logger.log(`File size > 300KB. Attempting image resizing...`);
        const resizeResult = await resizeImagesInZip(zip); // <-- Call your utility here

        if (!resizeResult.success) {
          await this.sendErrorEmail(
            userEmail,
            `Failed to resize images: ${resizeResult.error}`,
          );
          return {
            success: false,
            cases: {},
            error: `Failed to resize images: ${resizeResult.error}`,
          };
        }

        zip = resizeResult.resizedZip!; // use resized zip
        this.logger.log(
          `Image resizing successful. Continuing with resized ZIP.`,
        );

        // Update the buffer and filesize after resizing
        buffer = zip.toBuffer();
        fileSizeKB = Math.round(buffer.byteLength / 1024);
        this.logger.log(`Resized ZIP file size: ${fileSizeKB} KB`);

        if (fileSizeKB > 300) {
          await this.sendErrorEmail(
            userEmail,
            'ZIP file is still too large after resizing.',
          );
          return {
            success: false,
            cases: {},
            error: 'ZIP file is still too large after resizing.',
          };
        }
      }

      if (!this.isZipFile(buffer)) {
        await this.sendErrorEmail(
          userEmail,
          'The file is not a valid ZIP file.',
        );
        return {
          success: false,
          cases: {},
          error: 'The file is not a valid ZIP file.',
        };
      }
      const zipEntries = zip.getEntries();
      const htmlFiles = zipEntries.filter(
        (entry) =>
          !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html'),
      );

      if (htmlFiles.length !== 1) {
        const errorMessage =
          htmlFiles.length === 0
            ? 'No HTML file found inside the ZIP.'
            : 'Multiple HTML files found inside the ZIP. Only one is allowed.';

        await this.sendErrorEmail(userEmail, errorMessage);
        return {
          success: false,
          cases: {},
          error: errorMessage,
        };
      }

      this.logger.log(`Extracted ${zipEntries.length} files from ZIP.`);

      // Call the inlineExternalCssInZip function and store the result
      const cssInliningResult = await inlineExternalCssInZip(zip);

      // Log the result of the CSS inlining operation
      this.logger.log(
        `CSS inlining result: ${cssInliningResult.success ? '✅ Success' : '❌ Failed'}`,
      );
      if (cssInliningResult.errors.length > 0) {
        this.logger.error('CSS inlining errors:', cssInliningResult.errors);
      }

      // === Perform all validations ===
      const results: Array<{
        check: string;
        success: boolean;
        errors: string[];
      }> = [];

      // Push the CSS inlining result into the results array
      results.push({
        check: 'Inline External CSS Check',
        success: cssInliningResult.success,
        errors: cssInliningResult.errors,
      });

      const htmlValidationResults = await runSpecificHtmlValidations(zip);
      results.push(...htmlValidationResults);

      // Plugin Check
      const pluginCheck = checkScriptsAndPluginsNotAllowed(zip);
      results.push({
        check: 'Plugin Check',
        success: pluginCheck.success,
        errors: pluginCheck.errors,
      });

      // HTML/CSS Check
      const htmlCssCheck = checkMapTagAndCssRules(zip, true);
      results.push({
        check: 'HTML/CSS Check',
        success: htmlCssCheck.success,
        errors: htmlCssCheck.errors,
      });

      // Background Style Check
      const bgStyleCheck = checkBackgroundStyles(zip);
      results.push({
        check: 'Background Style Check',
        success: bgStyleCheck.success,
        errors: bgStyleCheck.errors,
      });

      // Embedded Video Check
      const htmlEntry = zipEntries.find((entry) =>
        entry.entryName.toLowerCase().endsWith('.html'),
      );
      if (htmlEntry) {
        const htmlContent = htmlEntry.getData().toString('utf8');
        const videoCheckResult = checkEmbeddedVideosInHtml(htmlContent);
        results.push({
          check: 'Embedded Video Check',
          success: videoCheckResult.success,
          errors: videoCheckResult.errors,
        });
      } else {
        results.push({
          check: 'Embedded Video Check',
          success: true, // No HTML found, assume pass
          errors: [],
        });
      }

      // Image Dimension Check
      const dimensionCheck = checkImageDimensionsMatchHtml(zip);
      results.push({
        check: 'Image Dimension Check',
        success: dimensionCheck.success,
        errors: dimensionCheck.errors,
      });

      const imageValidationResults =
        await this.imageValidationService.validateImagesFromZip(zip);
      results.push(...imageValidationResults);

      // If any check failed, return the validation results early
      if (!results.every((result) => result.success)) {
        return {
          success: false,
          results,
        };
      }
      // === If all validations pass, continue with upload ===
      const uploadedFiles = await Promise.all(
        zipEntries.map(async (entry) => {
          if (entry.isDirectory) return null;

          const fullPath = entry.entryName;
          const fileName = fullPath.split('/').pop() || fullPath;
          const fileExt = fileName.split('.').pop()?.toLowerCase() || 'unknown';
          const fileBuffer = entry.getData();

          // Only allow .html files
          if (fileExt !== 'html') {
            this.logger.log(`Skipping non-HTML file: ${fileName}`);
            return null;
          }

          if (!fileName || !fileBuffer?.length) {
            this.logger.warn(`Skipping invalid or empty file: ${fileName}`);
            return null;
          }

          const uploadPath = `extracted/${fileName}`;

          const { error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(uploadPath, fileBuffer, {
              contentType: 'text/html',
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
