// import * as AdmZip from 'adm-zip';

// interface ValidationResult {
//   success: boolean;
//   errors: string[];
// }

// export function checkMapTagAndCssRules(zip: AdmZip): ValidationResult {
//   const entries = zip.getEntries();
//   const errors: string[] = [];

//   for (const entry of entries) {
//     if (entry.isDirectory) continue;

//     const entryName = entry.entryName.toLowerCase();

//     if (entryName.endsWith('.html')) {
//       const htmlContent = entry.getData().toString('utf8');

//       // Check for <map> tag
//       const hasMapTag = /<\s*map[^>]*>/i.test(htmlContent);
//       if (hasMapTag) {
//         errors.push(`Found <map> tag in ${entry.entryName}`);
//       }

//       // Check for float or position in inline <style> tags or style attributes
//       const floatRegex = /float\s*:/i;
//       const positionRegex = /position\s*:/i;

//       const hasFloat = floatRegex.test(htmlContent);
//       const hasPosition = positionRegex.test(htmlContent);

//       if (hasFloat) {
//         errors.push(`CSS float property used in ${entry.entryName}`);
//       }
//       if (hasPosition) {
//         errors.push(`CSS position property used in ${entry.entryName}`);
//       }
//     }

//     // If external CSS files exist (.css), scan those too
//     if (entryName.endsWith('.css')) {
//       const cssContent = entry.getData().toString('utf8');

//       if (/float\s*:/i.test(cssContent)) {
//         errors.push(`CSS float property used in ${entry.entryName}`);
//       }
//       if (/position\s*:/i.test(cssContent)) {
//         errors.push(`CSS position property used in ${entry.entryName}`);
//       }
//     }
//   }

//   return {
//     success: errors.length === 0,
//     errors,
//   };
// }
import * as AdmZip from 'adm-zip';

interface ValidationResult {
  success: boolean;
  errors: string[];
}

export function checkMapTagAndCssRules(zip: AdmZip): ValidationResult {
  const entries = zip.getEntries();
  const errors: string[] = [];

  const selfClosingTags = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName.toLowerCase();

    if (entryName.endsWith('.html')) {
      const htmlContent = entry.getData().toString('utf8');
      const lines = htmlContent.split('\n');

      // Check for <map> tag and inline float/position CSS
      lines.forEach((line, index) => {
        const lineNum = index + 1;
        if (/<\s*map[^>]*>/i.test(line)) {
          errors.push(
            `Found <map> tag in ${entry.entryName} (line ${lineNum})`,
          );
        }
        if (/float\s*:/i.test(line)) {
          errors.push(
            `CSS float property used in ${entry.entryName} (line ${lineNum})`,
          );
        }
        if (/position\s*:/i.test(line)) {
          errors.push(
            `CSS position property used in ${entry.entryName} (line ${lineNum})`,
          );
        }
      });

      // Track unmatched tags with line numbers
      const tagStack: { tag: string; line: number }[] = [];
      const tagRegex = /<\/?([a-z0-9]+)(\s[^>]*)?>/gi;

      lines.forEach((line, index) => {
        const lineNum = index + 1;
        let match;
        while ((match = tagRegex.exec(line)) !== null) {
          const [, rawTag] = match;
          const tag = rawTag.toLowerCase();
          const isClosing = match[0][1] === '/';

          if (selfClosingTags.has(tag)) continue;

          if (isClosing) {
            if (
              tagStack.length === 0 ||
              tagStack[tagStack.length - 1].tag !== tag
            ) {
              errors.push(
                `Unmatched closing tag </${tag}> in ${entry.entryName} (line ${lineNum})`,
              );
            } else {
              tagStack.pop();
            }
          } else {
            tagStack.push({ tag, line: lineNum });
          }
        }
      });

      // Unclosed tags left in stack
      tagStack.forEach(({ tag, line }) =>
        errors.push(
          `Unclosed tag <${tag}> in ${entry.entryName} (line ${line})`,
        ),
      );
    }

    if (entryName.endsWith('.css')) {
      const cssContent = entry.getData().toString('utf8');
      const cssLines = cssContent.split('\n');

      cssLines.forEach((line, index) => {
        const lineNum = index + 1;
        if (/float\s*:/i.test(line)) {
          errors.push(
            `CSS float property used in ${entry.entryName} (line ${lineNum})`,
          );
        }
        if (/position\s*:/i.test(line)) {
          errors.push(
            `CSS position property used in ${entry.entryName} (line ${lineNum})`,
          );
        }
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
