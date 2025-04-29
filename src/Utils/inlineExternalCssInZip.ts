import * as AdmZip from 'adm-zip';
import { parse } from 'node-html-parser';

/**
 * Replaces external CSS links with embedded <style> blocks in HTML files.
 * Returns the updated zip for downstream checks, along with the status response.
 */
export function inlineExternalCssInZip(zip: AdmZip): {
  check: string;
  success: boolean;
  errors: string[];
} {
  const cssFiles: Record<string, string> = {};
  const errors: string[] = [];

  // Step 1: Collect all CSS file contents
  console.log('Collecting CSS files...');
  zip.getEntries().forEach((entry) => {
    if (!entry.isDirectory) {
      const fileName = entry.entryName.toLowerCase();
      if (fileName.endsWith('.css') || !fileName.includes('.')) {
        const cssContent = entry.getData().toString('utf8');
        if (isValidCss(cssContent)) {
          cssFiles[entry.entryName] = cssContent;
          console.log(`Found valid CSS file: ${entry.entryName}`);
        } else {
          console.log(
            `Skipping non-CSS file (invalid CSS content): ${entry.entryName}`,
          );
        }
      }
    }
  });

  if (Object.keys(cssFiles).length === 0) {
    errors.push('No valid CSS files found in the ZIP.');
    console.log('No valid CSS files found in the ZIP.');
  } else {
    console.log(`Found ${Object.keys(cssFiles).length} valid CSS files.`);
  }

  // Step 2: Process each HTML file
  console.log('Processing HTML files...');
  let modified = false;

  zip.getEntries().forEach((entry) => {
    if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
      console.log(`Processing HTML file: ${entry.entryName}`);

      const originalHtml = entry.getData().toString('utf8');
      const root = parse(originalHtml);

      root.querySelectorAll('link[rel="stylesheet"]').forEach((linkTag) => {
        const href = linkTag.getAttribute('href')?.trim();
        if (href) {
          const resolvedPath = resolveFilePath(href, cssFiles);
          if (resolvedPath && cssFiles[resolvedPath]) {
            console.log(`Found CSS link to replace: ${href}`);
            const styleTag = `<style>\n${cssFiles[resolvedPath]}\n</style>`;
            linkTag.replaceWith(styleTag);
            modified = true;
          } else {
            console.log(`CSS file not found for ${href}.`);
            errors.push(`CSS file not found for ${href}.`);
          }
        }
      });

      if (modified) {
        console.log(`Updated HTML file: ${entry.entryName}`);
        const updatedHtml = root.toString();
        zip.updateFile(entry.entryName, Buffer.from(updatedHtml, 'utf8'));
      }
    }
  });

  console.log('Finished processing ZIP file.');

  return {
    check: 'Inline External CSS Check',
    success: errors.length === 0,
    errors:
      errors.length > 0
        ? errors
        : ['CSS inlining: ✅ All external CSS files successfully inlined.'],
  };
}

/**
 * Check if the content of a file contains valid CSS.
 */
function isValidCss(content: string): boolean {
  const cssPattern = /[\{\}\:;]\s*[\w\-]+\s*[\{\}\:;]/;
  return cssPattern.test(content);
}

/**
 * Tries to resolve the CSS file path with fallback matching.
 */
function resolveFilePath(
  href: string,
  cssFiles: Record<string, string>,
): string | null {
  // Direct match
  if (cssFiles[href]) {
    return href;
  }

  // Normalize helper
  const normalize = (str: string) =>
    str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  const normalizedHref = normalize(href);

  // Try fuzzy matching based on normalized names
  for (const path in cssFiles) {
    if (
      normalize(path).includes(normalizedHref) ||
      normalize(path).endsWith(normalizedHref)
    ) {
      return path;
    }
  }

  return null;
}
