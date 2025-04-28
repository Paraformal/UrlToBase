import * as AdmZip from 'adm-zip';

export async function runSpecificHtmlValidations(zip: AdmZip): Promise<
  Array<{
    check: string;
    success: boolean;
    errors: string[];
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
      });
      return results;
    }

    for (const entry of htmlEntries) {
      const errors = [];
      let success = true;

      try {
        const html = entry.getData().toString('utf8');

        // 1. External CSS check
        const hasExternalCSS =
          /<link[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']+["']/i.test(
            html,
          );
        if (hasExternalCSS) {
          errors.push('Ext_Css_Pass ✅');
        } else {
          errors.push('Ext_Css_Fail ❌');
          success = false;
        }

        // 2. Hardcoded URL check
        const urlRegex = /href\s*=\s*["']([^"']+)["']/gi;
        let match;
        let hardUrlPass = true;

        while ((match = urlRegex.exec(html)) !== null) {
          const url = match[1];
          if (
            !url.startsWith('http://') &&
            !url.startsWith('https://') &&
            !url.startsWith('mailto:') &&
            !url.startsWith('tel:') &&
            !url.startsWith('#')
          ) {
            hardUrlPass = false;
            break;
          }
        }

        if (hardUrlPass) {
          errors.push('Hard_Url_Pass ✅');
        } else {
          errors.push('Hard_Url_Fail ❌');
          success = false;
        }

        // 3. URL length check
        const urlLengthRegex = /https?:\/\/[^\s"'<>]+/gi;
        let longUrlFound = false;
        let urlMatch;

        while ((urlMatch = urlLengthRegex.exec(html)) !== null) {
          const url = urlMatch[0];
          if (url.length > 1024) {
            longUrlFound = true;
            break;
          }
        }

        if (!longUrlFound) {
          errors.push('Len_Url_Pass ✅');
        } else {
          errors.push('Len_Url_Fail ❌');
          success = false;
        }

        // 4. Width check
        const widthRegex = /(width\s*=\s*["']?(\d+)(px)?["'])/gi;
        let widthFail = false;
        let widthMatch;

        while ((widthMatch = widthRegex.exec(html)) !== null) {
          const widthValue = parseInt(widthMatch[2]);
          if (widthValue > 600) {
            widthFail = true;
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
        errors.push(`Error parsing HTML: ${error.message}`);
      }

      results.push({
        check: entry.entryName,
        success,
        errors,
      });
    }

    return results;
  } catch (error) {
    return [
      {
        check: 'ZIP Processing',
        success: false,
        errors: [error.message],
      },
    ];
  }
}
