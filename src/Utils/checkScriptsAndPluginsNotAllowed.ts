import * as AdmZip from 'adm-zip';

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
          `Disallowed tag found in ${entry.entryName} (line ${lineNumber})`,
        );
      }

      // Check disallowed keywords
      if (
        DISALLOWED_KEYWORDS.some((keyword) =>
          line.toLowerCase().includes(keyword),
        )
      ) {
        errors.push(
          `Disallowed keyword found in ${entry.entryName} (line ${lineNumber})`,
        );
      }

      // Check for bad file extension references (in src/href)
      const fileExtPattern = new RegExp(
        DISALLOWED_FILE_EXTENSIONS.join('|').replace(/\./g, '\\.'),
        'i',
      );
      if (fileExtPattern.test(line)) {
        errors.push(
          `Suspicious file reference found in ${entry.entryName} (line ${lineNumber})`,
        );
      }
    });
  });

  // Return the check name with success/failure emojis
  return {
    success: errors.length === 0,
    errors: [`Scripts and Plugins Check: ${errors.length === 0 ? '✅' : '❌'}`],
  };
}
