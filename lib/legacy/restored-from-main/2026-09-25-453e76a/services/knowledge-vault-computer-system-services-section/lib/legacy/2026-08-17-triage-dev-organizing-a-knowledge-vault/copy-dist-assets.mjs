/**
 * copy-dist-assets  -  mirror non-TypeScript source assets into dist.
 *
 * `tsc` emits only .mjs/.d.mts. Any plain-data artifacts this package publishes
 * are not code, so the compiler never carries them. This walks `src` and copies
 * every non-`.mts` file to the same relative path under `dist`. Dependency-free
 * (node builtins only) so a standalone clone builds with `node` + `tsc` alone,
 * matching the workspace's self-contained build policy.
 */
import { readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(pkgDir, "src");
const distDir = join(pkgDir, "dist");

function* assetFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* assetFiles(full);
    else if (!entry.name.endsWith(".mts")) yield full;
  }
}

let copied = 0;
if (existsSync(srcDir)) {
  for (const file of assetFiles(srcDir)) {
    const dest = join(distDir, relative(srcDir, file));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
    copied += 1;
  }
}
process.stderr.write(`copy-dist-assets: ${copied} asset(s) -> dist/\n`);
