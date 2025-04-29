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
  details: string[];
} {
  const details: string[] = [];
  const zipEntries = zip.getEntries();

  zipEntries.forEach((entry) => {
    if (!entry.entryName.toLowerCase().endsWith('.html')) return;

    const htmlContent = entry.getData().toString('utf8');
    const lines = htmlContent.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Check disallowed tags (case-insensitive match like <script or <SCRIPT etc.)
      DISALLOWED_TAGS.forEach((tag) => {
        const tagRegex = new RegExp(`<\\s*${tag}\\b`, 'i');
        if (tagRegex.test(line)) {
          details.push(
            `Disallowed tag "<${tag}>" found in ${entry.entryName} (line ${lineNumber})`,
          );
        }
      });

      // Check disallowed keywords (anywhere in the line)
      DISALLOWED_KEYWORDS.forEach((keyword) => {
        if (line.toLowerCase().includes(keyword)) {
          details.push(
            `Disallowed keyword "${keyword}" found in ${entry.entryName} (line ${lineNumber})`,
          );
        }
      });

      // Check for disallowed file extensions in href/src attributes
      const fileExtRegex = new RegExp(
        `(?:href|src)\\s*=\\s*["'][^"']*(${DISALLOWED_FILE_EXTENSIONS.map((ext) => ext.replace('.', '\\.')).join('|')})["']`,
        'i',
      );
      if (fileExtRegex.test(line)) {
        details.push(
          `Suspicious file reference found in ${entry.entryName} (line ${lineNumber})`,
        );
      }
    });
  });

  const success = details.length === 0;

  return {
    success,
    errors: [`Scripts and Plugins Check: ${success ? '✅' : '❌'}`],
    details,
  };
}
