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
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ZipExtractService {
  private readonly logger = new Logger(ZipExtractService.name);
  private supabase = createClient(
    process.env.SUPABASE_URL, // Supabase URL to connect to the database
    process.env.SUPABASE_KEY, // Supabase API key for authentication
  );
  private bucketName = process.env.SUPABASE_BUCKET_NAME; // Bucket name for file storage

  // Constructor to inject MailerService to send error notifications via email
  constructor(private readonly mailerService: MailerService) {}

  /**
   * This method processes the uploaded base64-encoded ZIP file, extracts its contents, validates them,
   * uploads valid files to Supabase storage, and sends email notifications if there are validation errors.
   *
   * @param base64Zip - A base64-encoded string representing the ZIP file that the user uploaded.
   * @param userEmail - The email address of the user who uploaded the ZIP file.
   * @returns An object containing either the URLs of the uploaded files or error details.
   */
  async extractAndUploadZip(base64Zip: string, userEmail: string) {
    try {
      // Log that the ZIP file has been received in base64 format.
      this.logger.log(`Received ZIP file in base64 format`);

      let buffer: Buffer;
      try {
        // Attempt to convert the base64-encoded string into a buffer (binary data)
        buffer = Buffer.from(base64Zip, 'base64');
      } catch (err) {
        // If base64 conversion fails, return an error
        this.logger.error(`Invalid base64 input`);
        return { error: 'Invalid base64 ZIP file.' };
      }

      // Calculate and log the file size in kilobytes (KB)
      const fileSizeKB = Math.round(buffer.byteLength / 1024);
      this.logger.log(`Received file size: ${fileSizeKB} KB`);

      // Validation checks for file size. If the file is too small or too large, reject the file.
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

      // Check if the file is a valid ZIP file (using the magic number for ZIP files)
      if (!this.isZipFile(buffer)) {
        await this.sendErrorEmail(
          userEmail,
          'The ZIP file uploaded is not a valid zip file. Please try again!',
        );
        return { error: 'The file is not a valid ZIP file.' };
      }

      // Attempt to extract the files from the ZIP archive
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      this.logger.log(`Extracted ${zipEntries.length} files from ZIP.`);

      // Array to store all validation errors encountered during ZIP content processing
      const allErrors: string[] = [];

      // Run various validation checks on the contents of the ZIP file.
      // Each check ensures that the files inside the ZIP meet certain criteria.

      // Check for disallowed scripts and plugins
      const pluginCheck = checkScriptsAndPluginsNotAllowed(zip);
      if (!pluginCheck.success) {
        allErrors.push(
          `Disallowed scripts/plugins found:<br/>${pluginCheck.errors.join('<br/>')}`,
        );
      }

      // Check for invalid or disallowed HTML/CSS rules
      const htmlCssCheck = checkMapTagAndCssRules(zip);
      if (!htmlCssCheck.success) {
        allErrors.push(
          `Disallowed HTML or CSS rules found:<br/>${htmlCssCheck.errors.join('<br/>')}`,
        );
      }

      // Check for issues with background styles
      const bgStyleCheck = checkBackgroundStyles(zip);
      if (!bgStyleCheck.success) {
        allErrors.push(
          `Background styling violations found:<br/>${bgStyleCheck.errors.join('<br/>')}`,
        );
      }

      // Check if any HTML files contain embedded videos (we require external links to YouTube/Vimeo)
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

      // Check if the image dimensions match the expected sizes from the HTML content
      const dimensionCheck = checkImageDimensionsMatchHtml(zip);
      if (!dimensionCheck.success) {
        allErrors.push(
          `Image dimension mismatch found:<br/>${dimensionCheck.errors.join('<br/>')}`,
        );
      }

      // If there are any validation errors, notify the user via email and log the errors
      if (allErrors.length > 0) {
        const combinedMessage = allErrors.join('<br/><br/>');
        await this.sendErrorEmail(userEmail, combinedMessage);
        const filePath = await this.exportErrorsToFile(userEmail, allErrors);

        // Upload the error log to Supabase storage and generate a signed URL for access
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = `${userEmail}.txt`;
        const uploadPath = `ErrorLogs/${fileName}`;

        const { error: uploadError } = await this.supabase.storage
          .from(this.bucketName)
          .upload(uploadPath, fileBuffer, {
            contentType: 'text/plain',
            upsert: true,
          });

        if (uploadError) {
          this.logger.error(
            `Failed to upload error log: ${JSON.stringify(uploadError)}`,
          );
          return { error: 'Validation failed.', details: allErrors };
        }

        // Create a signed URL for the uploaded error log to allow the user to download it
        const { data: signedUrlData, error: signedUrlErr } =
          await this.supabase.storage
            .from(this.bucketName)
            .createSignedUrl(uploadPath, 60 * 60 * 24 * 7); // 1 week validity

        if (signedUrlErr) {
          this.logger.error(
            `Failed to create signed URL for error log: ${JSON.stringify(signedUrlErr)}`,
          );
          return { error: 'Validation failed.', details: allErrors };
        }

        // Return the error details along with a link to the error log for user download
        return {
          error: 'Validation failed.',
          details: allErrors,
          errorLogUrl: signedUrlData.signedUrl,
        };
      }

      // If there were no errors, upload the valid files to Supabase and generate signed URLs for them
      const uploadedFiles = await Promise.all(
        zipEntries.map(async (entry) => {
          // Skip directories
          if (entry.isDirectory) return null;

          const fullPath = entry.entryName;
          const fileName = fullPath.split('/').pop() || fullPath;
          const fileExt = fileName.split('.').pop() || 'unknown';
          const fileBuffer = entry.getData();

          // Skip invalid or empty files
          if (!fileName || !fileBuffer?.length) {
            this.logger.warn(`Skipping invalid or empty file: ${fileName}`);
            return null;
          }

          // Define upload path in Supabase storage
          const uploadPath = `extracted/${fileName}`;

          // Upload the extracted file to Supabase storage
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

          // Generate a signed URL for the uploaded file for user access
          const { data, error: signedUrlError } = await this.supabase.storage
            .from(this.bucketName)
            .createSignedUrl(uploadPath, 60 * 60); // 1 hour validity for URL

          if (signedUrlError) {
            this.logger.error(
              `Failed to generate signed URL for ${fileName}: ${JSON.stringify(signedUrlError, null, 2)}`,
            );
            return null;
          }

          // Return the file's URL and basic metadata
          return {
            FileName: fileName,
            FileExt: fileExt,
            Url: data.signedUrl,
          };
        }),
      );

      // Filter out any null values (e.g., invalid files that were skipped)
      const files = uploadedFiles.filter((file) => file !== null);
      return { Files: files };
    } catch (error) {
      // Log any errors that occur during the extraction process
      this.logger.error(`Error extracting ZIP: ${error.message}`);
      return { error: `ZIP extraction failed: ${error.message}` };
    }
  }

  /**
   * Sends an error email to the user if validation fails.
   *
   * @param userEmail - The email address of the user who uploaded the ZIP file.
   * @param errorMessage - A detailed error message explaining the validation failure.
   */
  private async sendErrorEmail(userEmail: string, errorMessage: string) {
    const mailDto: SendMailDto = {
      receiver: userEmail,
      subject: 'ZIP Extraction Failed',
      emailBody: `<p>Dear Customer,</p>
                  <p>Unfortunately, your ZIP extraction request has failed due to validation errors.</p>
                  <p><strong>Error Details:</strong><br/>${errorMessage}</p>
                  <p>Please try again or contact support for further assistance.</p>
                  <p>Best regards,<br/>Your Support Team</p>`,
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

  /**
   * Checks if the provided data buffer represents a valid ZIP file.
   * The check is performed by verifying the "magic number" for ZIP files.
   *
   * @param data - The buffer containing the binary data of the file.
   * @returns A boolean indicating whether the buffer is a valid ZIP file.
   */
  private isZipFile(data: Buffer): boolean {
    const magicNumber = data.slice(0, 2).toString('utf8');
    return magicNumber === 'PK'; // Valid ZIP files begin with "PK"
  }

  /**
   * Saves the list of validation errors to a text file and returns the file path.
   *
   * @param userEmail - The email address of the user who submitted the ZIP file.
   * @param errors - A list of validation errors to be saved in the file.
   * @returns The file path where the errors were saved.
   */
  private async exportErrorsToFile(
    userEmail: string,
    errors: string[],
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `zip_errors_${timestamp}.txt`;
    const filePath = path.join(__dirname, '..', '..', 'logs', fileName);

    // Prepare the content of the error report
    const header = `--- ZIP VALIDATION REPORT ---\n\nUser Email: ${userEmail}\nTimestamp: ${new Date().toLocaleString()}\n\n--- ERRORS ---\n\n`;
    const content = errors
      .map((err, i) => `🔴 Issue ${i + 1}:\n${err}\n\n---\n`)
      .join('');

    // Ensure the log directory exists before writing the error file
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, header + content, 'utf8');

    this.logger.log(`Error log saved at ${filePath}`);
    return filePath;
  }
}
