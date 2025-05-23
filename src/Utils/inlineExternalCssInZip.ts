// import * as AdmZip from 'adm-zip';
// import { parse } from 'node-html-parser';
// import fetch from 'node-fetch'; // Added for URL support

// /**
//  * Replaces external CSS links (both local and remote) with embedded <style> blocks.
//  * Returns the updated zip with status report.
//  */
// export async function inlineExternalCssInZip(zip: AdmZip): Promise<{
//   // Changed to async
//   check: string;
//   success: boolean;
//   errors: string[];
// }> {
//   const cssFiles: Record<string, string> = {};
//   const errors: string[] = [];
//   let modified = false;

//   // Helper functions
//   const isUrl = (href: string) =>
//     href.startsWith('http://') || href.startsWith('https://');
//   const normalizePath = (str: string) =>
//     str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

//   // Step 1: Collect local CSS files (original logic)
//   zip.getEntries().forEach((entry) => {
//     if (!entry.isDirectory) {
//       const fileName = entry.entryName.toLowerCase();
//       if (fileName.endsWith('.css') || !fileName.includes('.')) {
//         const cssContent = entry.getData().toString('utf8');
//         if (isValidCss(cssContent)) {
//           cssFiles[entry.entryName] = cssContent;
//           console.log(`Found valid CSS file: ${entry.entryName}`);
//         }
//       }
//     }
//   });

//   // Step 2: Process HTML files with async support
//   for (const entry of zip.getEntries()) {
//     // Changed to for..of for async
//     if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
//       console.log(`Processing HTML file: ${entry.entryName}`);
//       const originalHtml = entry.getData().toString('utf8');
//       const root = parse(originalHtml);

//       const links = root.querySelectorAll('link[rel="stylesheet"]');
//       for (const linkTag of links) {
//         // Changed to for..of for async
//         const href = linkTag.getAttribute('href')?.trim();
//         if (!href) continue;

//         try {
//           let cssContent: string;

//           if (isUrl(href)) {
//             // Handle external URL
//             console.log(`Fetching remote CSS: ${href}`);
//             const response = await fetch(href);
//             if (!response.ok) throw new Error(`HTTP ${response.status}`);
//             cssContent = await response.text();

//             if (!isValidCss(cssContent)) {
//               throw new Error('Returned content is not valid CSS');
//             }
//           } else {
//             // Handle local file
//             const resolvedPath = Object.keys(cssFiles).find(
//               (path) =>
//                 normalizePath(path) === normalizePath(href) ||
//                 path.endsWith(href),
//             );

//             if (!resolvedPath || !cssFiles[resolvedPath]) {
//               throw new Error('Local CSS file not found');
//             }
//             cssContent = cssFiles[resolvedPath];
//           }

//           linkTag.replaceWith(`<style>\n${cssContent}\n</style>`);
//           modified = true;
//         } catch (error) {
//           errors.push(`CSS loading failed for ${href}: ${error.message}`);
//           console.error(`Error processing ${href}:`, error.message);
//         }
//       }

//       if (modified) {
//         zip.updateFile(entry.entryName, Buffer.from(root.toString(), 'utf8'));
//         modified = false; // Reset for next file
//       }
//     }
//   }

//   return {
//     check: 'Inline External CSS Check',
//     success: errors.length === 0,
//     errors:
//       errors.length > 0
//         ? errors
//         : ['✅ All CSS (local and remote) successfully inlined.'],
//   };
// }

// // Keep existing validation and resolution helpers
// function isValidCss(content: string): boolean {
//   const cssPattern = /[\{\}\:;]\s*[\w\-]+\s*[\{\}\:;]/;
//   return cssPattern.test(content);
// }

// // Optional: Add timeout wrapper for fetch if needed
import * as AdmZip from 'adm-zip';
import { parse } from 'node-html-parser';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
);

export async function inlineExternalCssInZip(zip: AdmZip): Promise<{
  check: string;
  success: boolean;
  errors: string[];
}> {
  const cssFiles: Record<string, string> = {};
  const errors: string[] = [];
  let modified = false;
  let totalCssLinkTags = 0;

  // Existing CSS collection logic
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

  // Existing HTML processing logic
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html')) {
      const originalHtml = entry.getData().toString('utf8');
      const root = parse(originalHtml);

      const links = root.querySelectorAll('link[rel="stylesheet"]');
      totalCssLinkTags += links.length;
      for (const linkTag of links) {
        const href = linkTag.getAttribute('href')?.trim();
        if (!href) continue;

        try {
          let cssContent: string;
          if (isUrl(href)) {
            const response = await fetch(href);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            cssContent = await response.text();
            if (!isValidCss(cssContent)) throw new Error('Invalid CSS content');
          } else {
            const resolvedPath = resolveFilePath(href, cssFiles);
            if (!resolvedPath) throw new Error('Local CSS not found');
            cssContent = cssFiles[resolvedPath];
          }
          linkTag.replaceWith(`<style>\n${cssContent}\n</style>`);
          modified = true;
        } catch (error) {
          errors.push(`CSS loading failed for ${href}: ${error.message}`);
        }
      }

      if (modified) {
        zip.updateFile(entry.entryName, Buffer.from(root.toString(), 'utf8'));
        modified = false;
      }
    }
  }

  if (Object.keys(cssFiles).length === 0 && totalCssLinkTags === 0) {
    return {
      check: 'Inline External CSS Check',
      success: true,
      errors: ['✅ No CSS found or referenced. Nothing to inline.'],
    };
  }

  // Add Supabase upload only if no errors
  if (errors.length === 0) {
    try {
      const zipBuffer = zip.toBuffer();
      const timestamp = Date.now();
      const fileName = `processed-${timestamp}.zip`;

      // Upload to Supabase
      const { error: uploadError } = await supabase.storage
        .from('ntgmvp')
        .upload(fileName, zipBuffer);

      if (uploadError) throw uploadError;

      // Get signed URL
      const { data, error: urlError } = await supabase.storage
        .from('ntgmvp')
        .createSignedUrl(fileName, 3600);

      if (urlError) throw urlError;

      // Add URL to success message
      return {
        check: 'Inline External CSS Check',
        success: true,
        errors: [`✅ All CSS inlined. Download URL: ${data.signedUrl}`],
      };
    } catch (error) {
      errors.push(`Upload failed: ${error.message}`);
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

// Helper functions remain unchanged
function isUrl(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://');
}

function resolveFilePath(
  href: string,
  cssFiles: Record<string, string>,
): string | null {
  if (cssFiles[href]) return href;
  const normalize = (str: string) =>
    str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const target = normalize(href);
  return (
    Object.keys(cssFiles).find((path) => normalize(path).includes(target)) ||
    null
  );
}

function isValidCss(content: string): boolean {
  return /[\{\}\:;]\s*[\w\-]+\s*[\{\}\:;]/.test(content);
}
