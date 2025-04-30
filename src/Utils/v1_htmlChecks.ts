import * as AdmZip from 'adm-zip';

export async function runSpecificHtmlValidations(zip: AdmZip): Promise<
  Array<{
    check: string;
    success: boolean;
    errors: string[];
    details: string[] | null;
  }>
> {
  const results = [];

  try {
    const zipEntries = zip.getEntries();
    const htmlEntries = zipEntries.filter(
      (entry) =>
        !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.html'),
    );

    if (htmlEntries.length === 0) {
      results.push({
        check: 'ZIP Content',
        success: false,
        errors: ['No HTML files found in the ZIP ❌'],
        details: ['Ensure at least one .html file is present.'],
      });
      return results;
    }

    for (const entry of htmlEntries) {
      const errors = [];
      const details = [];
      let success = true;
      let hasCSSIssues = false; // Combined CSS flag

      try {
        const html = entry.getData().toString('utf8');

        // ========== CSS VALIDATION ==========
        const linkTags = (html.match(/<link\b[^>]*>/gi) || []) as string[];
        linkTags.forEach((tag) => {
          const isStylesheet =
            tag.toLowerCase().includes('rel="stylesheet"') ||
            tag.toLowerCase().includes("rel='stylesheet'");
          const hrefMatch = tag.match(/href=(["'])(.*?)\1/i);

          if (isStylesheet && hrefMatch) {
            const href = hrefMatch[2].trim();

            // External CSS check
            if (href.startsWith('http://') || href.startsWith('https://')) {
              hasCSSIssues = true;
              details.push(`External CSS: ${tag.trim()}`);
            }
            // Local path validation
            else if (!/^[a-zA-Z0-9_\-./]+\.css$/.test(href)) {
              hasCSSIssues = true;
              details.push(`Invalid CSS path: "${href}"`);
            }
          }
        });

        // CSS check result
        if (hasCSSIssues) {
          errors.push('Ext_Css_Fail ❌');
          success = false;
        } else {
          errors.push('Ext_Css_Pass ✅');
        }

        // ========== URL VALIDATION ========== (ORIGINAL CODE PRESERVED)
        const urlRegex = /href\s*=\s*["']([^"']+)["']/gi;
        let urlMatch;
        let hardUrlPass = true;

        while ((urlMatch = urlRegex.exec(html)) !== null) {
          const url = urlMatch[1];
          if (
            !url.startsWith('http://') &&
            !url.startsWith('https://') &&
            !url.startsWith('mailto:') &&
            !url.startsWith('tel:') &&
            !url.startsWith('#')
          ) {
            hardUrlPass = false;
            details.push(`Hardcoded/relative URL: "${url}"`);
            break;
          }
        }

        if (hardUrlPass) {
          errors.push('Hard_Url_Pass ✅');
        } else {
          errors.push('Hard_Url_Fail ❌');
          success = false;
        }

        // ========== URL LENGTH CHECK ========== (ORIGINAL CODE PRESERVED)
        const urlLengthRegex = /https?:\/\/[^\s"'<>]+/gi;
        let longUrlFound = false;
        let lengthMatch;

        while ((lengthMatch = urlLengthRegex.exec(html)) !== null) {
          const url = lengthMatch[0];
          if (url.length > 1024) {
            longUrlFound = true;
            details.push(
              `Long URL (${url.length} chars): ${url.slice(0, 100)}...`,
            );
            break;
          }
        }

        if (!longUrlFound) {
          errors.push('Len_Url_Pass ✅');
        } else {
          errors.push('Len_Url_Fail ❌');
          success = false;
        }

        // ========== WIDTH CHECK ========== (ORIGINAL CODE PRESERVED)
        const widthRegex = /(width\s*=\s*["']?(\d+)(px)?["'])/gi;
        let widthFail = false;
        let widthMatch;

        while ((widthMatch = widthRegex.exec(html)) !== null) {
          const widthValue = parseInt(widthMatch[2]);
          if (widthValue > 600) {
            widthFail = true;
            details.push(`Width >600px: ${widthMatch[0]}`);
            break;
          }
        }

        if (!widthFail) {
          errors.push('Pix_Test_Pass ✅');
        } else {
          errors.push('Pix_Test_Fail ❌');
          success = false;
        }
      } catch (error) {
        success = false;
        errors.push(`HTML parsing error: ${error.message}`);
        details.push(error.stack || 'No stack trace available');
      }

      results.push({
        check: entry.entryName,
        success,
        errors,
        details: success ? null : details,
      });
    }

    return results;
  } catch (error) {
    return [
      {
        check: 'ZIP Processing',
        success: false,
        errors: [error.message],
        details: [error.stack || 'No stack trace available'],
      },
    ];
  }
}
