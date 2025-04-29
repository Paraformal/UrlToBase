import * as AdmZip from 'adm-zip';
import { parse, HTMLElement } from 'node-html-parser';

interface ValidationResult {
  success: boolean;
  errors: string[];
  fixedHtmlFiles?: { [filename: string]: string };
}

const voidElements = new Set([
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

function walkDOM(
  node: HTMLElement,
  tagStack: { tag: string; line: number }[],
  errors: string[],
  entryName: string,
) {
  if (!node.tagName) return;

  const tag = node.tagName.toLowerCase();
  const line = 0;

  if (!voidElements.has(tag)) {
    if (!node.childNodes || node.childNodes.length === 0) {
      errors.push(`Unclosed tag <${tag}> in ${entryName} (line ${line})`);
    }
  }

  node.childNodes.forEach((child: any) => {
    if (child instanceof HTMLElement) {
      walkDOM(child, tagStack, errors, entryName);
    }
  });
}

export function checkMapTagAndCssRules(
  zip: AdmZip,
  autoFix = true,
): ValidationResult {
  const entries = zip.getEntries();
  const errors: string[] = [];
  const fixedHtmlFiles: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName.toLowerCase();

    if (entryName.endsWith('.css')) {
      // ❌ No external CSS files allowed
      console.log(`Found external CSS file: ${entry.entryName}`);
      errors.push(`External CSS file is not allowed: ${entry.entryName}`);
      continue;
    }

    if (entryName.endsWith('.html')) {
      const htmlContent = entry.getData().toString('utf8');

      try {
        const root = parse(htmlContent, {
          lowerCaseTagName: true,
          comment: false,
          blockTextElements: {
            script: true,
            noscript: true,
            style: true,
            pre: true,
          },
        });

        const tagStack: { tag: string; line: number }[] = [];
        walkDOM(root, tagStack, errors, entry.entryName);

        htmlContent.split('\n').forEach((line, index) => {
          const lineNum = index + 1;

          if (/<\s*map[^>]*>/i.test(line)) {
            console.log(
              `Found <map> tag in ${entry.entryName} line ${lineNum}`,
            );
            errors.push(
              `Found <map> tag in ${entry.entryName} (line ${lineNum})`,
            );
          }

          if (/float\s*:/i.test(line)) {
            console.log(
              `Found CSS float in ${entry.entryName} line ${lineNum}`,
            );
            errors.push(
              `CSS float property used in ${entry.entryName} (line ${lineNum})`,
            );
          }

          if (/position\s*:/i.test(line)) {
            console.log(
              `Found CSS position in ${entry.entryName} line ${lineNum}`,
            );
            errors.push(
              `CSS position property used in ${entry.entryName} (line ${lineNum})`,
            );
          }
        });

        if (autoFix && errors.some((e) => e.includes('Unclosed tag'))) {
          const fixedHtml = root.toString();
          fixedHtmlFiles[entry.entryName] = fixedHtml;
        }
      } catch (err) {
        errors.push(`Error parsing ${entry.entryName}: ${err.message}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    errors: [
      `Map Tag and CSS Rules Check: ${errors.length === 0 ? '✅' : '❌'}`,
      ...errors,
    ],
    fixedHtmlFiles: Object.keys(fixedHtmlFiles).length
      ? fixedHtmlFiles
      : undefined,
  };
}
