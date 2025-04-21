import { JSDOM } from 'jsdom';

const knownVideoHosts = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'tiktok.com',
  'facebook.com',
  'streamable.com',
  'wistia.com',
  'loom.com',
];

function isExternalVideoLink(url: string): boolean {
  return knownVideoHosts.some((host) => url.includes(host));
}

export function checkEmbeddedVideosInHtml(html: string): {
  success: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // ❌ Disallow <video> and <embed>
  const videoTags = Array.from(document.querySelectorAll('video'));
  const embedTags = Array.from(document.querySelectorAll('embed'));

  if (videoTags.length > 0) {
    errors.push(
      '❌ <video> tag(s) detected. Use a static image linking to a video instead.',
    );
  }

  if (embedTags.length > 0) {
    errors.push('❌ <embed> tag(s) detected. Embedding videos is not allowed.');
  }

  // ❌ Disallow <iframe> embeds pointing to video services
  const iframeTags = Array.from(document.querySelectorAll('iframe'));
  for (const iframe of iframeTags) {
    const src = iframe.getAttribute('src') || '';
    if (isExternalVideoLink(src)) {
      errors.push(
        `❌ <iframe> embed from "${src}" is not allowed. Use a preview image linking to this video.`,
      );
    } else {
      errors.push(`❌ <iframe> detected. Embedding content is not allowed.`);
    }
  }

  // ✅ Look for allowed static preview image linking to video
  const anchorTags = Array.from(document.querySelectorAll('a'));
  for (const a of anchorTags) {
    const href = a.getAttribute('href') || '';
    const hasImgChild = a.querySelector('img') !== null;

    if (isExternalVideoLink(href) && !hasImgChild) {
      errors.push(
        `⚠️ Link to video (${href}) must be shown using a preview image, not plain link.`,
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
