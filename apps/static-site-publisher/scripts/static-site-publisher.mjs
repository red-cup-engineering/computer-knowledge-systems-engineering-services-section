#!/usr/bin/env node
// static-site-publisher build <contentDir> <outDir> [--drafts]
// static-site-publisher check <contentDir>
// static-site-publisher serve <contentDir> [--port=8561] [--host=0.0.0.0] [--release]
// victor new <type> <name> [--dir <contentDir>]

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { build, writeArtifacts, writeBuildReport } from '../src/build.mjs';
import { normalizeProjectConfig } from '../src/config.mjs';
import { loadProjectConfig } from '../src/read-project-config.mjs';
import { createVictorWebsite } from '../src/website.mjs';
import { verifyWebReleaseDirectory } from '@red-cup-engineering/web-release-candidate-service';

const [, , command, ...args] = process.argv;
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const configFlag = args.find((a) => a.startsWith('--config='));

async function projectOptions() {
  const config = await loadProjectConfig(configFlag ? configFlag.slice('--config='.length) : null);
  const normalized = normalizeProjectConfig(config);
  return { ...normalized.config, configurationRefusals: normalized.refusals };
}

function printReport(report) {
  for (const r of report.refusals) console.error(`refusal ${r.code} · ${r.subject}: ${r.reason}`);
  for (const a of report.advisories) console.error(`advisory ${a.code ?? ''} · ${a.subject ?? ''}: ${a.reason}`);
  console.error(`${report.cellCount} cells, ${report.publishedCount} published, ` +
    `${report.refusals.length} refusals, ${report.advisories.length} advisories · catalog ${report.catalogHash}`);
}

if (command === 'build') {
  const [contentDir, outDir] = positional;
  const { artifacts, report } = await build({ contentDir, drafts: flags.has('--drafts'), ...await projectOptions() });
  printReport(report);
  if (!report.releasable) { console.error('not releasable: refusals stand.'); process.exit(1); }
  await writeArtifacts(artifacts, outDir);
  const reportPath = await writeBuildReport(report, outDir);
  if (report.releaseCandidate.enabled && report.releaseCandidate.emitted) {
    const manifest = JSON.parse(artifacts.get(report.releaseCandidate.path));
    const verification = await verifyWebReleaseDirectory({ manifest, root: outDir, ...report.releaseCandidate.limits });
    if (!verification.valid) {
      for (const diagnostic of verification.diagnostics) {
        console.error(`release verification ${diagnostic.code} · ${diagnostic.subject}: ${diagnostic.message}`);
      }
      console.error('not releasable: written directory differs from its release manifest.');
      process.exit(1);
    }
    console.error(`verified ${verification.verifiedFileCount} release files against ${verification.manifestDigest}`);
  }
  console.error(`wrote ${artifacts.size} artifacts to ${outDir}; build report to ${reportPath}`);
} else if (command === 'check') {
  const [contentDir] = positional;
  const options = await projectOptions();
  const first = await build({ contentDir, drafts: true, ...options });
  const second = await build({ contentDir, drafts: true, ...options });
  const usesManifest = first.report.releaseCandidate.enabled && second.report.releaseCandidate.enabled;
  const deterministic = usesManifest
    ? first.report.releaseCandidate.digest === second.report.releaseCandidate.digest
    : JSON.stringify(first.report.artifactHashes) === JSON.stringify(second.report.artifactHashes);
  if (!deterministic) first.report.refusals.push({ code: 'R-02', subject: 'build', reason: 'two builds of the same catalog differ' });
  printReport(first.report);
  console.error(deterministic
    ? `deterministic: double-build ${usesManifest ? 'release manifest identities' : 'artifact hashes'} match.`
    : 'NOT deterministic.');
  process.exit(first.report.refusals.length ? 1 : 0);
} else if (command === 'serve') {
  const [contentDir] = positional;
  const port = Number((args.find((a) => a.startsWith('--port')) || '').split('=')[1] || 8561);
  const host = (args.find((a) => a.startsWith('--host=')) || '').split('=')[1] || '0.0.0.0';
  // --release serves what `static-site-publisher build` would release: no drafts, no watcher.
  // Without it, serve is the authoring loop: drafts visible, rebuilt on change.
  const release = flags.has('--release');
  const { installGracefulShutdown } = await import('@red-cup-engineering/http-services-section/node-server');
  const options = await projectOptions();
  const website = await createVictorWebsite({ contentDir, drafts: !release, ...options });
  if (!release) {
    website.watch({
      onRebuild: () => console.error('rebuilt.'),
      onError: (error) => console.error(`rebuild refused: ${error.message}`),
    });
  }
  const running = await website.start({ port, host });
  installGracefulShutdown(website, {});
  console.error(`victor serving on http://${host}:${running.port}/ (${release ? 'release' : 'drafts visible'})`);
} else if (command === 'new') {
  const [type, name] = positional;
  const dirFlag = args.find((a) => a.startsWith('--dir='));
  const contentDir = dirFlag ? dirFlag.slice(6) : '.';
  const today = new Date().toISOString().slice(0, 10);
  const file = join(contentDir, `${name}.md`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `---\ntitle: ${name.split('/').pop().replace(/-/g, ' ')}\ndate-created: ${today}\ntype: ${type}\nstatus: potential\ntags: []\n---\n\n`, { flag: 'wx' });
  console.error(`scaffolded ${file}`);
} else {
  console.error('usage: static-site-publisher build <contentDir> <outDir> [--drafts] [--config=FILE] | check <contentDir> [--config=FILE] | serve <contentDir> [--port=N] [--config=FILE] | new <type> <name> [--dir=D]');
  process.exit(2);
}
