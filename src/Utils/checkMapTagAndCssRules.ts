import * as AdmZip from 'adm-zip';

interface ValidationResult {
  success: boolean;
  errors: string[];
  fixedHtmlFiles?: { [filename: string]: string };
}

export function checkMapTagAndCssRules(
  zip: AdmZip,
  autoFix = true,
): ValidationResult {
  const entries = zip.getEntries();
  const errors: string[] = [];
  const fixedHtmlFiles: Record<string, string> = {};

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
      const tagStack: { tag: string; line: number }[] = [];

      const tagRegex = /<\/?([a-z0-9]+)(\s[^>]*?)?>/gi;
      const newLines: string[] = [];

      lines.forEach((line, index) => {
        const lineNum = index + 1;
        let match;

        while ((match = tagRegex.exec(line)) !== null) {
          const fullTag = match[0];
          const [, rawTag] = match;
          const tag = rawTag.toLowerCase();
          const isClosing = fullTag.startsWith('</');

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

        // Check for map/float/position issues
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

      // If autofix is enabled, append missing closing tags
      if (autoFix && tagStack.length > 0) {
        tagStack
          .slice()
          .reverse()
          .forEach(({ tag }) => {
            const closeTag = `</${tag}>`;
            newLines.push(closeTag);
            errors.push(
              `Auto-inserted missing closing tag ${closeTag} at end of ${entry.entryName}`,
            );
          });

        fixedHtmlFiles[entry.entryName] = newLines.join('\n');
      } else {
        tagStack.forEach(({ tag, line }) => {
          errors.push(
            `Unclosed tag <${tag}> in ${entry.entryName} (line ${line})`,
          );
        });
      }
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

  // Return the check name with success/failure emojis
  return {
    success: errors.length === 0,
    errors: [
      `Map Tag and CSS Rules Check: ${errors.length === 0 ? '✅' : '❌'}`,
    ],
  };
}
