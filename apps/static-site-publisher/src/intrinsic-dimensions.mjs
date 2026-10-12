// Authored Markdown images carry no width or height, so every page that shows
// one would shift its layout as the image arrives (SAS C-10). The publisher
// holds the image bytes as release artifacts, so it states each local image's
// intrinsic size on the <img> itself before conformance reads the page.

/** The intrinsic { width, height } of PNG, GIF, WebP, JPEG, or SVG bytes, or null when the bytes do not state one. */
export function intrinsicImageSize(body) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString('latin1', 12, 16) === 'IHDR') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && bytes.toString('latin1', 0, 4) === 'GIF8') return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length >= 30 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return webpSize(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  const text = bytes.toString('utf8', 0, Math.min(bytes.length, 4096));
  if (/<svg[\s>]/u.test(text)) return svgSize(text);
  return null;
}

function webpSize(bytes) {
  const chunk = bytes.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

function jpegSize(bytes) {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // Start-of-frame markers carry the frame size; C4 (DHT), C8 (JPG), and CC (DAC) share the range but do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}

function svgSize(text) {
  const root = /<svg\b([^>]*)>/u.exec(text)?.[1] ?? '';
  const attribute = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'u').exec(root)?.[1];
  const length = (value) => (value !== undefined && /^\s*\d+(\.\d+)?\s*(px)?\s*$/u.test(value) ? Number.parseFloat(value) : undefined);
  const [width, height] = [length(attribute('width')), length(attribute('height'))];
  if (width && height) return { width, height };
  const box = attribute('viewBox')?.trim().split(/[\s,]+/u).map(Number);
  if (box?.length === 4 && box[2] > 0 && box[3] > 0) return { width: box[2], height: box[3] };
  return null;
}

/**
 * Gives every <img> whose src names a release artifact the intrinsic width and
 * height it lacks. Authored dimensions are kept; external and unknown images are
 * left for conformance to report.
 */
export function stampIntrinsicImageDimensions(artifactRecords, artifacts) {
  const sizes = new Map();
  const sizeOf = (path) => {
    if (!sizes.has(path)) {
      const record = artifactRecords.get(path);
      sizes.set(path, record && /^image\//u.test(record.mediaType ?? '') ? intrinsicImageSize(record.body) : null);
    }
    return sizes.get(path);
  };
  for (const [path, record] of artifactRecords) {
    if (!/^text\/html\b/u.test(record.mediaType ?? '') || typeof record.body !== 'string' || !record.body.includes('<img')) continue;
    const body = record.body.replace(/<img\b([^>]*?)(\s*\/?)>/giu, (tag, attrs, close) => {
      if (/\swidth\s*=/iu.test(attrs) && /\sheight\s*=/iu.test(attrs)) return tag;
      const src = /\ssrc\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1];
      if (!src?.startsWith('/') || src.startsWith('//')) return tag;
      const size = sizeOf(decodeURIComponent(src.slice(1).split(/[?#]/u)[0]));
      if (!size) return tag;
      return `<img${attrs} width="${Math.round(size.width)}" height="${Math.round(size.height)}"${close}>`;
    });
    if (body === record.body) continue;
    artifactRecords.set(path, Object.freeze({ ...record, body }));
    artifacts.set(path, body);
  }
}
