import { pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';

/** Load a VICTOR project's config module (a fresh, cache-busted dynamic import) and resolve its publicDir against the config file's own directory. Split out of config.mjs (561-group ruling: a hull module may not reach a kernel module by a relative import) so config.mjs's normalizers and DEFAULT_ constants stay a pure transformation; this is the one effectful read behind it. */
export async function loadProjectConfig(file) {
  if (!file) return {};
  const configFile = resolve(file);
  const url = pathToFileURL(configFile);
  url.searchParams.set('loaded', String(Date.now()));
  const module = await import(url.href);
  const config = module.default ?? module.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError(`${file} must default-export a VICTOR configuration object`);
  }
  if (typeof config.publicDir === 'string' && !isAbsolute(config.publicDir)) {
    return { ...config, publicDir: resolve(dirname(configFile), config.publicDir) };
  }
  return config;
}
