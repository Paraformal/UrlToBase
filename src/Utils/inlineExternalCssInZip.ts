import * as AdmZip from 'adm-zip';
import { parse } from 'node-html-parser';
import fetch from 'node-fetch'; // Added for URL support

/**
 * Replaces external CSS links (both local and remote) with embedded <style> blocks.
 * Returns the updated zip with status report.
 */
export async function inlineExternalCssInZip(zip: AdmZip): Promise<{
  // Changed to async
  check: string;
  success: boolean;
  errors: string[];
}> {
  const cssFiles: Record<string, string> = {};
  const errors: string[] = [];
  let modified = false;

  // Helper functions
  const isUrl = (href: string) =>
    href.startsWith('http://') || href.startsWith('https://');
  const normalizePath = (str: string) =>
    str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Step 1: Collect local CSS files (original logic)
  zip.getEntries().forEach((entry) => {
    if (!entry.isDirectory) {
      const fileName = entry.entryName.toLowerCase();
      if (fileName.endsWith('.css') || !fileName.includes('.')) {
        const cssContent = entry.getData().toString('utf8');
        if (isValidCss(cssContent)) {
          cssFiles[entry.entryName] = cssContent;
          console.log(`Found valid CSS file: ${entry.entryName}`);
        }
      }
    }
  });

  // Step 2: Process HTML files with async support
  for (const entry of zip.getEntries()) {
    // Changed to for..of for async
    if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
      console.log(`Processing HTML file: ${entry.entryName}`);
      const originalHtml = entry.getData().toString('utf8');
      const root = parse(originalHtml);

      const links = root.querySelectorAll('link[rel="stylesheet"]');
      for (const linkTag of links) {
        // Changed to for..of for async
        const href = linkTag.getAttribute('href')?.trim();
        if (!href) continue;

        try {
          let cssContent: string;

          if (isUrl(href)) {
            // Handle external URL
            console.log(`Fetching remote CSS: ${href}`);
            const response = await fetch(href);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            cssContent = await response.text();

            if (!isValidCss(cssContent)) {
              throw new Error('Returned content is not valid CSS');
            }
          } else {
            // Handle local file
            const resolvedPath = Object.keys(cssFiles).find(
              (path) =>
                normalizePath(path) === normalizePath(href) ||
                path.endsWith(href),
            );

            if (!resolvedPath || !cssFiles[resolvedPath]) {
              throw new Error('Local CSS file not found');
            }
            cssContent = cssFiles[resolvedPath];
          }

          linkTag.replaceWith(`<style>\n${cssContent}\n</style>`);
          modified = true;
        } catch (error) {
          errors.push(`CSS loading failed for ${href}: ${error.message}`);
          console.error(`Error processing ${href}:`, error.message);
        }
      }

      if (modified) {
        zip.updateFile(entry.entryName, Buffer.from(root.toString(), 'utf8'));
        modified = false; // Reset for next file
      }
    }
  }

  return {
    check: 'Inline External CSS Check',
    success: errors.length === 0,
    errors:
      errors.length > 0
        ? errors
        : ['✅ All CSS (local and remote) successfully inlined.'],
  };
}

// Keep existing validation and resolution helpers
function isValidCss(content: string): boolean {
  const cssPattern = /[\{\}\:;]\s*[\w\-]+\s*[\{\}\:;]/;
  return cssPattern.test(content);
}

// Optional: Add timeout wrapper for fetch if needed
