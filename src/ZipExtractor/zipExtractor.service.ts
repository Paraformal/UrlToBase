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
import { resizeImagesInZip, ResizeResult } from 'src/Utils/resizeImage';
import { inlineExternalCssInZip } from 'src/Utils/inlineExternalCssInZip';
import * as fs from 'fs';
import * as path from 'path';

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
    const results: Array<{
      check: string;
      success: boolean;
      errors: string[];
      resized?: boolean;
    }> = [];
    try {
      this.logger.log(`Received ZIP file in base64 format`);
      let resizedImages;
      let resizeResult: ResizeResult | undefined;
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

      if (fileSizeKB > 300) {
        this.logger.log(`File size > 300KB. Attempting image resizing...`);
        resizeResult = await resizeImagesInZip(zip);
        console.log('BERBERBER', resizeResult);

        resizedImages = resizeResult.resizedImagesMap
          ? Object.values(resizeResult.resizedImagesMap).some(
              (val) => val === true,
            )
          : false;

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

        zip = resizeResult.resizedZip!;
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

      const cssInliningResult = await inlineExternalCssInZip(zip);
      this.logger.log(
        `CSS inlining result: ${cssInliningResult.success ? '✅ Success' : '❌ Failed'}`,
      );
      if (cssInliningResult.errors.length > 0) {
        this.logger.error('CSS inlining errors:', cssInliningResult.errors);
      }

      // const results: Array<{
      //   check: string;
      //   success: boolean;
      //   errors: string[];
      // }> = [];

      results.push({
        check: 'Inline External CSS Check',
        success: cssInliningResult.success,
        errors: cssInliningResult.errors,
      });

      const htmlValidationResults = await runSpecificHtmlValidations(zip);
      results.push(...htmlValidationResults);

      const pluginCheck = checkScriptsAndPluginsNotAllowed(zip);
      results.push({
        check: 'Plugin Check',
        success: pluginCheck.success,
        errors: pluginCheck.errors,
      });

      const htmlCssCheck = checkMapTagAndCssRules(zip, true);
      results.push({
        check: 'HTML/CSS Check',
        success: htmlCssCheck.success,
        errors: htmlCssCheck.errors,
      });

      const bgStyleCheck = checkBackgroundStyles(zip);
      results.push({
        check: 'Background Style Check',
        success: bgStyleCheck.success,
        errors: bgStyleCheck.errors,
      });

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
          success: true,
          errors: [],
        });
      }

      const dimensionCheck = checkImageDimensionsMatchHtml(zip);
      results.push({
        check: 'Image Dimension Check',
        success: dimensionCheck.success,
        errors: dimensionCheck.errors,
      });

      const imageValidationResults =
        await this.imageValidationService.validateImagesFromZip(
          zip,
          resizedImages,
        );
      results.push(...imageValidationResults);

      const overallSuccess = results.every((r) => r.success);
      const emailBody = this.generateValidationResultsEmail(
        results,
        overallSuccess,
      );

      const mailDto: SendMailDto = {
        receiver: userEmail,
        subject: 'ZIP Validation Results',
        emailBody,
        cc: [],
        bcc: [],
      };
      await this.mailerService.sendMail(mailDto);

      // Log the upload
      const uploadedFileName = htmlFiles[0].entryName;
      this.logUploadToFile(userEmail, uploadedFileName);

      return {
        success: overallSuccess,
        results,
      };
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

  private generateValidationResultsEmail(
    results: Array<{
      check: string;
      success: boolean;
      errors: string[];
      details?: string[];
    }>,
    overallSuccess: boolean,
  ): string {
    let table = `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-family:Arial, sans-serif; font-size:14px;">
        <thead>
          <tr style="background-color:#f2f2f2;">
            <th>Check</th>
            <th>Status</th>
            <th>Messages</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const result of results) {
      const status = result.success
        ? '<span style="color:green;">Passed ✅</span>'
        : '<span style="color:red;">Failed ❌</span>';

      const errors =
        result.errors && result.errors.length
          ? result.errors.map((e) => `<div>${e}</div>`).join('')
          : '';

      const details =
        result.details && result.details.length
          ? result.details.map((d) => `<div>${d}</div>`).join('')
          : '';

      table += `
        <tr>
          <td>${result.check}</td>
          <td>${status}</td>
          <td>${errors}</td>
          <td>${details}</td>
        </tr>
      `;
    }

    table += `
        </tbody>
      </table>
    `;

    const summary = overallSuccess
      ? `<p style="color:green;"><strong>All checks passed successfully.</strong></p>`
      : `<p style="color:red;"><strong>Some checks failed. Please review the details below.</strong></p>`;

    return `
      <p>Dear Customer,</p>
      <p>Your ZIP file has been processed. Below are the results of the checks and validations:</p>
      ${summary}
      ${table}
      <p>If you have questions or need assistance, please reply to this email.</p>
      <p>Best Regards,<br>Your Support Team</p>
    `;
  }

  private logUploadToFile(userEmail: string, filename: string) {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const username = userEmail.split('@')[0];
    const fileUrl = `https://example.com/files/${username}/${filename}`;

    const logLine = `
==============================
Email: ${userEmail}
------------------------------
Filename: ${filename}
URL: ${fileUrl}
Timestamp: ${timestamp}
`;

    const logDir = path.join(__dirname, '..', '..', 'logs');
    const logFilePath = path.join(logDir, 'upload_logs.txt');

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(logFilePath, logLine, 'utf8');
      this.logger.log(`Upload logged to ${logFilePath}`);
    } catch (error) {
      this.logger.error(`Failed to write to log file: ${error.message}`);
    }
  }
}
