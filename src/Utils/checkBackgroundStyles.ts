import * as AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';

interface ValidationResult {
  success: boolean;
  errors: string[];
}

export function checkBackgroundStyles(zip: AdmZip): ValidationResult {
  const entries = zip.getEntries();
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const name = entry.entryName.toLowerCase();
    const content = entry.getData().toString('utf8');

    // Check CSS files line-by-line
    if (name.endsWith('.css')) {
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (/background-image\s*:/i.test(line)) {
          errors.push(
            `Background image found in ${entry.entryName} (line ${lineNumber})`,
          );
        }
        if (/background-color\s*:/i.test(line)) {
          errors.push(
            `Background color used in ${entry.entryName} (line ${lineNumber})`,
          );
        }
      });
    }

    // Check HTML inline styles with nesting awareness
    if (name.endsWith('.html')) {
      const lines = content.split('\n');
      const $ = cheerio.load(content, { xmlMode: false });

      $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const elHtml = $.html(el);
        const lineIndex = lines.findIndex((line) =>
          line.includes(elHtml.slice(0, 20)),
        ); // rough match
        const lineNumber = lineIndex + 1;

        if (/background-image\s*:/i.test(style)) {
          errors.push(
            `Inline background image in ${entry.entryName} (line ${lineNumber})`,
          );
        }

        if (/background-color\s*:/i.test(style)) {
          const parentHasBg = $(el)
            .parents()
            .toArray()
            .some((parent) => {
              const pStyle = $(parent).attr('style') || '';
              return /background-color\s*:/i.test(pStyle);
            });

          if (parentHasBg) {
            errors.push(
              `Nested background-color in ${entry.entryName} (line ${lineNumber})`,
            );
          }

          const isInsideTable = $(el).parents('table').length > 0;
          if (!isInsideTable) {
            errors.push(
              `Background-color outside <table> in ${entry.entryName} (line ${lineNumber})`,
            );
          }
        }
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
