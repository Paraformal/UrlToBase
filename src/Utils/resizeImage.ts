import * as sharp from 'sharp';
import * as AdmZip from 'adm-zip';

export interface ResizeResult {
  success: boolean;
  resizedZip?: AdmZip;
  error?: string;
  resizedImagesMap?: Record<string, boolean>; // Added to track resized images
}

export async function resizeImagesInZip(zip: AdmZip): Promise<ResizeResult> {
  console.log('[resizeImagesInZip] Called.');

  const MAX_ZIP_SIZE = 300 * 1024; // 300 KB
  const MAX_WIDTH = 600; // Maximum image width (600px)
  const newZip = new AdmZip();
  const htmlEntries: AdmZip.IZipEntry[] = [];
  const images: { entry: AdmZip.IZipEntry; data: Buffer }[] = [];

  try {
    // 1. Extract and classify entries
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;

      const lowerName = entry.entryName.toLowerCase();
      if (lowerName.endsWith('.html')) {
        htmlEntries.push(entry); // Store all HTML files in an array
      } else if (
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.webp') ||
        lowerName.endsWith('.gif')
      ) {
        images.push({ entry, data: entry.getData() });
      } else {
        newZip.addFile(entry.entryName, entry.getData()); // Copy other files
      }
    }

    // Check if there is more than one HTML file
    if (htmlEntries.length > 1) {
      console.error(
        '[resizeImagesInZip] More than one HTML file found in the ZIP.',
      );
      return {
        success: false,
        error: 'More than one HTML file found in the ZIP.',
      };
    }

    // If no HTML file found, return an error
    if (htmlEntries.length === 0) {
      console.error('[resizeImagesInZip] No HTML file found in the ZIP.');
      return { success: false, error: 'No HTML file found in the ZIP.' };
    }

    const htmlContent = htmlEntries[0].getData().toString('utf8');

    // 2. Prepare images for resizing
    let quality = 80; // Start quality
    let widthReductionFactor = 1.0;

    async function buildZip(
      currentImages: { entry: AdmZip.IZipEntry; data: Buffer }[],
    ) {
      const tempZip = new AdmZip();
      for (const img of currentImages) {
        tempZip.addFile(img.entry.entryName, img.data);
      }
      tempZip.addFile(
        htmlEntries[0].entryName,
        Buffer.from(htmlContent, 'utf8'),
      );
      return tempZip;
    }

    let currentImages = [...images];

    // Log initial ZIP size
    const initialZip = await buildZip(currentImages);
    const initialBuffer = initialZip.toBuffer();
    console.log(
      `[resizeImagesInZip] Initial ZIP size: ${(initialBuffer.length / 1024).toFixed(2)} KB`,
    );

    // Map to track which images were resized
    const resizedImagesMap: Record<string, boolean> = {};

    while (true) {
      const tempZip = await buildZip(currentImages);
      const tempBuffer = tempZip.toBuffer();

      console.log(
        `[resizeImagesInZip] Current ZIP size: ${(tempBuffer.length / 1024).toFixed(2)} KB (quality=${quality}, widthReductionFactor=${widthReductionFactor.toFixed(2)})`,
      );

      if (tempBuffer.length <= MAX_ZIP_SIZE) {
        console.log(
          '[resizeImagesInZip] ZIP is under 300KB, returning success.',
        );

        // Mark images that were resized compared to original images
        for (const img of images) {
          const currentImg = currentImages.find(
            (ci) => ci.entry.entryName === img.entry.entryName,
          );
          if (!currentImg) continue;

          // Compare buffers to detect resizing (simple byte length check)
          if (!currentImg.data.equals(img.data)) {
            resizedImagesMap[img.entry.entryName] = true;
          } else {
            resizedImagesMap[img.entry.entryName] = false;
          }
        }

        return { success: true, resizedZip: tempZip, resizedImagesMap };
      }

      // Need to resize more
      if (quality > 40) {
        quality -= 10;
        console.log(`[resizeImagesInZip] Reducing quality to ${quality}.`);
      } else if (widthReductionFactor > 0.5) {
        widthReductionFactor -= 0.1;
        console.log(
          `[resizeImagesInZip] Reducing widthReductionFactor to ${widthReductionFactor.toFixed(2)}.`,
        );
      } else {
        console.error(
          '[resizeImagesInZip] Cannot reduce ZIP size below 300KB after multiple attempts.',
        );
        return {
          success: false,
          error: 'Cannot reduce ZIP size below 300KB after multiple attempts.',
        };
      }

      // Resize images again
      const resizedImages: { entry: AdmZip.IZipEntry; data: Buffer }[] = [];

      for (const { entry, data } of images) {
        const image = sharp(data);
        const metadata = await image.metadata();
        let newImage = image;

        if (metadata.width && metadata.height) {
          // Enforce the max width to be 600px
          const newWidth = Math.min(
            Math.floor(metadata.width * widthReductionFactor),
            MAX_WIDTH,
          );
          console.log(
            `[resizeImagesInZip] Resizing ${entry.entryName} from ${metadata.width} to ${newWidth} width.`,
          );
          newImage = newImage.resize(newWidth);
        }

        let outputBuffer: Buffer;
        if (entry.entryName.toLowerCase().endsWith('.png')) {
          outputBuffer = await newImage.png({ quality }).toBuffer();
        } else if (
          entry.entryName.toLowerCase().endsWith('.jpg') ||
          entry.entryName.toLowerCase().endsWith('.jpeg')
        ) {
          outputBuffer = await newImage.jpeg({ quality }).toBuffer();
        } else if (entry.entryName.toLowerCase().endsWith('.webp')) {
          outputBuffer = await newImage.webp({ quality }).toBuffer();
        } else {
          outputBuffer = await newImage.toBuffer();
        }

        resizedImages.push({
          entry,
          data: outputBuffer,
        });
      }

      currentImages = resizedImages;
    }
  } catch (err: any) {
    console.error('[resizeImagesInZip] Error:', err.message || err);
    return {
      success: false,
      error: err.message || 'Unknown error during resizing.',
    };
  }
}
