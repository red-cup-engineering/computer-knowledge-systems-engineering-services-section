import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { extensionType } from '@red-cup-engineering/computer-serialized-content-engineering-services-section/services/http-data-services-section/src/media-type';

// Text types are served as UTF-8.
export function mediaTypeFor(path) {
  if (path === 'feed.atom.xml') return 'application/atom+xml; charset=utf-8';
  const type = extensionType(path);
  return /^text\/|^application\/(?:json|xml|manifest\+json)$/u.test(type) ? `${type}; charset=utf-8` : type;
}

export async function collectPublicAssets(publicDir) {
  const assets = new Map();
  const refusals = [];
  if (!publicDir) return { assets, refusals };

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(directory, entry.name);
      const name = relative(publicDir, full).split(sep).join('/');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) assets.set(name, await readFile(full));
      else refusals.push({
        code: 'R-15',
        subject: name,
        reason: 'public assets must be ordinary files or directories; symbolic links and special files are not followed',
      });
    }
  }

  try {
    await walk(publicDir);
  } catch (error) {
    refusals.push({
      code: 'R-15',
      subject: 'publicDir',
      reason: `cannot read configured public asset directory: ${error.message}`,
    });
  }
  return { assets, refusals };
}
