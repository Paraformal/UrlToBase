import * as AdmZip from 'adm-zip';
// import * as cheerio from 'cheerio';

const DISALLOWED_TAGS = ['script', 'embed', 'object', 'iframe', 'applet'];
const DISALLOWED_FILE_EXTENSIONS = [
  '.js',
  '.swf',
  '.jar',
  '.exe',
  '.dll',
  '.vbs',
];
const DISALLOWED_KEYWORDS = [
  'javascript:',
  'vbscript:',
  'data:text/html',
  'flash',
  'application/x-shockwave-flash',
];

export function checkScriptsAndPluginsNotAllowed(zip: AdmZip): {
  success: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const zipEntries = zip.getEntries();

  zipEntries.forEach((entry) => {
    if (!entry.entryName.endsWith('.html')) return;

    const htmlContent = entry.getData().toString('utf8');
    const lines = htmlContent.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Check disallowed tags
      if (
        DISALLOWED_TAGS.some((tag) => new RegExp(`<${tag}\\b`, 'i').test(line))
      ) {
        errors.push(
          `Disallowed tag in ${entry.entryName} (line ${lineNumber})`,
        );
      }

      // Check disallowed keywords
      if (
        DISALLOWED_KEYWORDS.some((keyword) =>
          line.toLowerCase().includes(keyword),
        )
      ) {
        errors.push(
          `Disallowed keyword usage in ${entry.entryName} (line ${lineNumber})`,
        );
      }

      // Check for bad file extension references (in src/href)
      const fileExtPattern = new RegExp(
        DISALLOWED_FILE_EXTENSIONS.join('|').replace(/\./g, '\\.'),
        'i',
      );
      if (fileExtPattern.test(line)) {
        errors.push(
          `Suspicious file reference in ${entry.entryName} (line ${lineNumber})`,
        );
      }
    });
  });

  return {
    success: errors.length === 0,
    errors,
  };
}
