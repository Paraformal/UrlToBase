import * as path from 'path';
import sizeOf from 'image-size';
import { JSDOM } from 'jsdom';
import AdmZip from 'adm-zip';

function extractCssDimension(
  style: string,
  prop: 'width' | 'height',
): number | null {
  const regex = new RegExp(`${prop}\\s*:\\s*(\\d+)px`, 'i');
  const match = style.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Validates if image dimensions in HTML match actual image dimensions in ZIP.
 * Supports images in nested folders or root level. Includes detailed logging.
 */
export function checkImageDimensionsMatchHtml(zip: AdmZip): {
  success: boolean;
  errors: string[];
} {
  const entries = zip.getEntries();
  const errors: string[] = [];

  const htmlEntry = entries.find((e) =>
    e.entryName.toLowerCase().endsWith('.html'),
  );

  if (!htmlEntry) {
    errors.push('❌ No HTML file found in ZIP.');
    return { success: false, errors };
  }

  const htmlContent = htmlEntry.getData().toString('utf8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  const imgTags = Array.from(
    document.querySelectorAll('img'),
  ) as HTMLImageElement[];

  for (const img of imgTags) {
    let src = img.getAttribute('src');
    const srcset = img.getAttribute('srcset');
    const widthAttr = img.getAttribute('width');
    const heightAttr = img.getAttribute('height');
    const styleAttr = img.getAttribute('style');

    if (!src && srcset) {
      const firstSrc = srcset.split(',')[0]?.split(' ')[0]?.trim();
      if (firstSrc) {
        src = firstSrc;
      }
    }

    if (!src) {
      errors.push(`❌ Missing 'src' in one of the <img> tags.`);
      continue;
    }

    const cleanSrc = src.replace(/^\.\//, '').replace(/^\/+/, '');
    const baseName = path.basename(cleanSrc);

    // Try exact match first
    let imgEntry = entries.find((e) => e.entryName.endsWith(cleanSrc));

    // Fallback: match by basename if full path match fails
    if (!imgEntry) {
      imgEntry = entries.find((e) => path.basename(e.entryName) === baseName);
      if (imgEntry) {
        console.warn(
          `⚠️ Fallback match for ${src} using basename (${baseName}) → ${imgEntry.entryName}`,
        );
      }
    }

    if (!imgEntry) {
      errors.push(`❌ Image file "${src}" not found in ZIP.`);
      continue;
    }

    try {
      const buffer = imgEntry.getData();
      const dimensions = sizeOf(buffer);

      let htmlWidth = widthAttr ? parseInt(widthAttr) : null;
      let htmlHeight = heightAttr ? parseInt(heightAttr) : null;

      if ((!htmlWidth || !htmlHeight) && styleAttr) {
        const styleWidth = extractCssDimension(styleAttr, 'width');
        const styleHeight = extractCssDimension(styleAttr, 'height');
        if (styleWidth) htmlWidth = htmlWidth ?? styleWidth;
        if (styleHeight) htmlHeight = htmlHeight ?? styleHeight;
      }

      if (
        (htmlWidth && htmlWidth !== dimensions.width) ||
        (htmlHeight && htmlHeight !== dimensions.height)
      ) {
        errors.push(
          `❌ Dimension mismatch for "${src}": HTML (${htmlWidth}x${htmlHeight}) vs Actual (${dimensions.width}x${dimensions.height})`,
        );
      }
    } catch (e: any) {
      errors.push(`❌ Failed to read dimensions for "${src}": ${e.message}`);
    }
  }

  // Return the check name with success/failure emojis
  return {
    success: errors.length === 0,
    errors: [
      `Image Dimensions Match Check: ${errors.length === 0 ? '✅' : '❌'}`,
    ],
  };
}
