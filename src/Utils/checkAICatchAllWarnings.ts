import * as AdmZip from 'adm-zip';

interface ValidationResult {
  success: boolean;
  warnings: string[];
}

export function runCatchAllValidation(zip: AdmZip): ValidationResult {
  const entries = zip.getEntries();
  const warnings: string[] = [];

  const suspiciousPatterns: { pattern: RegExp; reason: string }[] = [
    {
      pattern: /style\s*=\s*["'][^"']*z-index\s*:/i,
      reason: 'Use of z-index (complex positioning)',
    },
    {
      pattern: /on\w+\s*=/i,
      reason: 'Inline event handler detected (e.g. onclick, onload)',
    },
    {
      pattern: /base64,/i,
      reason: 'Base64-encoded resource detected (large inline images or files)',
    },
    {
      pattern: /<\s*iframe[^>]*>/i,
      reason: 'Iframe detected (may be used for embeds or tracking)',
    },
    {
      pattern: /visibility\s*:/i,
      reason: 'Use of CSS visibility property (may hide content)',
    },
    {
      pattern: /text-indent\s*:\s*-\d+/i,
      reason: 'Negative text indent (may be used for hiding text)',
    },
    {
      pattern: /display\s*:\s*none/i,
      reason: 'Display:none used (may hide content)',
    },
    {
      pattern: /font-size\s*:\s*0/i,
      reason: 'Font-size:0 used (invisible text)',
    },
    {
      pattern: /<\s*link[^>]+rel\s*=\s*["']?import["']?/i,
      reason: 'HTML Imports (deprecated)',
    },
    {
      pattern: /<\s*object[^>]*>/i,
      reason: 'Object tag detected (legacy plugin)',
    },
    {
      pattern: /filter\s*:/i,
      reason: 'CSS filter used (may create visual tricks)',
    },
  ];

  for (const entry of entries) {
    if (!entry.entryName.toLowerCase().endsWith('.html')) continue;

    const html = entry.getData().toString('utf8');
    const lines = html.split('\n');

    lines.forEach((line, index) => {
      suspiciousPatterns.forEach(({ pattern, reason }) => {
        if (pattern.test(line)) {
          warnings.push(`${reason} in ${entry.entryName} (line ${index + 1})`);
        }
      });
    });
  }

  return {
    success: warnings.length === 0,
    warnings,
  };
}
