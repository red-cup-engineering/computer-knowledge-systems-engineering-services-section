// The build: catalog -> artifacts + report. Pure over (contentDir, site, theme);
// determinism is checked by building twice and comparing artifact hashes.

import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { assembleCatalog } from '@red-cup-engineering/knowledge-system-server/catalog';
import { createFilesystemContentReader } from '@red-cup-engineering/knowledge-system-server/content-reader';
import { foundingDateRefusals } from './publication-policy.mjs';
import { createTuftePublicationApplication, routeName } from '@red-cup-engineering/web-page-tiling-engine/publication';
import { DEFAULT_THEME, validateTheme } from '@red-cup-engineering/web-theming-service/theming';
import { tufteThemeStyles } from '@red-cup-engineering/web-page-tiling-engine/theme';
import { DEFAULT_SITE, normalizeArchives, normalizeDiscovery, normalizeSite, DEFAULT_CATALOG } from './config.mjs';
import { collectPublicAssets, mediaTypeFor } from './assets.mjs';
import { stampIntrinsicImageDimensions } from './intrinsic-dimensions.mjs';
import { projectArtifacts } from './build-projectors.mjs';
import { projectProgressiveWebAppArtifacts } from '@red-cup-engineering/computer-systems-publishing-engineering-services-section/project-progressive-web-app-artifacts';
import { createTufteSearchArtifacts } from '@red-cup-engineering/web-page-tiling-engine/search';
import { projectWebReleaseManifestArtifact } from '@red-cup-engineering/web-release-candidate-service';
import { checkStaticSiteInventory } from '@red-cup-engineering/static-site-conformance-service';
import { checkRenderedHtml } from './conformance.mjs';
import { transformBrowserAssetInventory } from '@red-cup-engineering/computer-systems-publishing-engineering-services-section/transform-browser-asset-inventory';
import victorPackage from '../package.json' with { type: 'json' };

export async function build({ contentDir, publicDir, reader, catalog: catalogConfig = DEFAULT_CATALOG, projectors = [], pwa, home = true, tufte = true, archives, search = {}, assets: assetConfig = {}, release = {}, discovery, conformance = {}, site = DEFAULT_SITE, theme = DEFAULT_THEME, drafts = false, configurationRefusals = [] }) {
  // The kernel edge: build.mjs already touches the real filesystem, so it (not
  // catalog.mjs, which stays a pure transformation over an injected reader)
  // supplies the concrete reader when a caller does not bring its own.
  const resolvedReader = catalogConfig?.dialect === 'vault' ? reader : (reader ?? await createFilesystemContentReader({ root: resolvePath(contentDir), extensions: ['.md'] }));
  const catalog = await assembleCatalog(contentDir, { reader: resolvedReader, catalog: catalogConfig, routeName });
  const refusals = [...configurationRefusals, ...catalog.report.refusals];
  const advisories = [...catalog.report.advisories];
  if (home !== true && home !== false && !(typeof home === 'string' && home.trim() !== '')) {
    refusals.push({ code: 'R-15', subject: 'config.home', reason: 'home must be true, false, or the non-empty name of the cell that owns the root route' });
    home = false;
  }
  const normalized = normalizeSite(site);
  site = normalized.site;

  refusals.push(...normalized.refusals);
  refusals.push(...foundingDateRefusals(catalog.cells, site.founded));
  refusals.push(...validateTheme(theme));
  // Pages rendered through TUFTE carry the theme as TUFTE's own custom properties.
  site = Object.freeze({ ...site, tufteStyles: tufteThemeStyles(theme) });
  if (release !== false && (!release || typeof release !== 'object' || Array.isArray(release))) {
    refusals.push({ code: 'R-15', subject: 'config.release', reason: 'release must be false or a web release candidate configuration object' });
    release = {};
  }
  if (assetConfig !== false && (!assetConfig || typeof assetConfig !== 'object' || Array.isArray(assetConfig))) {
    refusals.push({ code: 'R-15', subject: 'config.assets', reason: 'assets must be false or a browser asset transformation configuration object' });
    assetConfig = {};
  }

  const normalizedArchives = normalizeArchives(archives);
  refusals.push(...normalizedArchives.refusals);
  const normalizedDiscovery = normalizeDiscovery(discovery);
  refusals.push(...normalizedDiscovery.refusals);
  if (!Array.isArray(projectors)) {
    refusals.push({ code: 'R-15', subject: 'config.projectors', reason: 'projectors must be an array' });
    projectors = [];
  }
  const publication = createTuftePublicationApplication({
    catalog,
    site: Object.freeze({
      ...site,
      home,
      theme,
      founded: site.founded,
      discovery: normalizedDiscovery.discovery,
      archives: normalizedArchives.archives,
      cellLabel: site.cellLabel,
    }),
    theme,
    home,
    drafts,
    tufte,
    archives: normalizedArchives.archives,
    search,
    discovery: normalizedDiscovery.discovery,
  });
  const { published, indexItems, homeCell, resolve, publicationArchives, updated } = publication.publicationContext;
  if (typeof home === 'string' && !homeCell) {
    refusals.push({ code: 'R-15', subject: 'config.home', reason: `home names "${home}", which is not a published cell` });
  }
  const context = Object.freeze({ ...publication.publicationContext, theme, publicDir });
  const projected = await projectArtifacts([...publication.publicationProjectors, ...publisherProjectors(), ...projectors], context);
  for (const diagnostic of projected.diagnostics) {
    const item = {
      code: diagnostic.code === 'BPC-003' ? 'R-01' : diagnostic.code,
      subject: diagnostic.subject ?? diagnostic.projector ?? 'projection',
      reason: diagnostic.message,
      data: { projector: diagnostic.projector, details: diagnostic.details },
    };
    if (diagnostic.severity === 'error') refusals.push(item);
    else advisories.push(item);
  }
  if (projected.artifacts.has('report.json')) {
    refusals.push({ code: 'R-01', subject: 'report.json', reason: 'projectors cannot claim VICTOR\'s release report path' });
  }

  const artifactRecords = new Map([...projected.artifacts]
    .filter(([path]) => path !== 'report.json')
    .map(([path, artifact]) => [path, artifact.mediaType === undefined
      ? Object.freeze({ ...artifact, mediaType: mediaTypeFor(path) })
      : artifact]));
  const artifacts = new Map([...artifactRecords].map(([path, artifact]) => [path, artifact.body]));
  const projectorOrder = [...projected.report.projectorOrder];
  stampIntrinsicImageDimensions(artifactRecords, artifacts);

  // Rendered-HTML conformance (SAS C-01/C-02/C-03/C-09/C-10/C-12/C-15) runs
  // over every HTML artifact as soon as projection completes, before asset
  // fingerprinting rewrites references, so a finding names the authored path.
  // Refusal is data: a failing page blocks release like any other refusal.
  let htmlConformance = null;
  let authoredReferences = catalogConfig.dialect === 'vault' ? 'advise' : 'refuse';
  if (conformance && typeof conformance === 'object' && conformance.authoredReferences !== undefined) {
    if (conformance.authoredReferences === 'advise' || conformance.authoredReferences === 'refuse') authoredReferences = conformance.authoredReferences;
    else refusals.push({ code: 'R-15', subject: 'config.conformance.authoredReferences', reason: 'authoredReferences must be "advise" or "refuse"' });
  }
  if (conformance !== false) {
    if (!conformance || typeof conformance !== 'object' || Array.isArray(conformance)) {
      refusals.push({ code: 'R-15', subject: 'config.conformance', reason: 'conformance must be false or a rendered-HTML conformance configuration object' });
    }
    htmlConformance = checkRenderedHtml(artifactRecords);
    projectorOrder.push({ name: 'rendered-html-conformance', priority: 101 });
    refusals.push(...htmlConformance.refusals);
    advisories.push(...htmlConformance.advisories);
  }

  let browserAssets = null;
  if (assetConfig !== false) {
    browserAssets = transformBrowserAssetInventory({ artifacts: artifactRecords, config: assetConfig });
    projectorOrder.push({ name: 'browser-asset-inventory', priority: 102 });
    for (const diagnostic of browserAssets.diagnostics) {
      refusals.push({ code: diagnostic.code, subject: diagnostic.subject, reason: diagnostic.message, data: { transformer: 'browser-asset-inventory' } });
    }
    if (browserAssets.diagnostics.length === 0) replaceArtifactInventory(browserAssets.artifacts, artifacts, artifactRecords);
  }

  // Asset rewriting sees all ordinary HTML and public assets. Search then adds
  // its generated index/runtime, and PWA precaching sees the completed result.
  if (search !== false) {
    mergeFollowupProjection({
      projection: createTufteSearchArtifacts({ artifacts, config: search }),
      name: 'public-site-search', priority: 105, artifacts, artifactRecords,
      projectorOrder, refusals, advisories,
    });
  }

  if (pwa !== undefined) {
    mergeFollowupProjection({
      projection: projectProgressiveWebAppArtifacts({ artifacts, config: pwa }),
      name: 'progressive-web-app', priority: 110, artifacts, artifactRecords,
      projectorOrder, refusals, advisories,
    });
  }

  let releaseManifest = null;
  let releaseManifestPath = null;
  // The release directory's declared size, for the verifier of the written directory; not part of the manifest.
  let releaseLimits = {};
  let staticSiteConformance = null;
  if (release !== false) {
    const { maxFiles, maxBytes, ...releaseProjection } = release;
    releaseLimits = { ...(maxFiles === undefined ? {} : { maxFiles }), ...(maxBytes === undefined ? {} : { maxBytes }) };
    releaseManifestPath = release.path ?? 'release-manifest.json';
    const projection = projectWebReleaseManifestArtifact({
      artifacts: artifactRecords,
      config: {
        ...releaseProjection,
        baseUrl: site.baseIri,
        excludePaths: release.excludePaths === undefined
          ? ['report.json']
          : Array.isArray(release.excludePaths)
            ? [...new Set([...release.excludePaths, 'report.json'])]
            : release.excludePaths,
        metadata: {
          victor: {
            version: victorPackage.version,
            catalogHash: catalog.hash,
            cellCount: catalog.cells.size,
            publishedCount: published.length,
            projectorOrder: [...projectorOrder],
          },
          site: release.metadata ?? {},
        },
      },
    });
    releaseManifest = projection.manifest;
    mergeFollowupProjection({
      projection, name: 'web-release-candidate', priority: 120,
      artifacts, artifactRecords, projectorOrder, refusals, advisories,
    });
    if (releaseManifest !== null) {
      staticSiteConformance = checkStaticSiteInventory({
        artifacts: artifactRecords,
        manifest: releaseManifest,
        runtimePaths: discoveryRuntimePaths(normalizedDiscovery.discovery, site.baseIri),
      });
      for (const diagnostic of staticSiteConformance.diagnostics) {
        const finding = {
          code: diagnostic.code,
          subject: diagnostic.subject ?? 'static-site-conformance',
          reason: diagnostic.message,
          data: { target: diagnostic.target },
        };
        // The renderer vouches for every reference it generates. A reference
        // that still names no artifact was authored, and a vault reports it
        // rather than refusing its whole release for it; a publication site
        // refuses, because its authors are asked to fix it.
        if (diagnostic.code === 'SSC-106' && authoredReferences === 'advise') advisories.push(finding);
        else refusals.push(finding);
      }
    }
  }

  const artifactHashes = {};
  for (const [path, content] of artifacts) {
    artifactHashes[path] = sha256Base64Url(content);
  }

  const report = {
    victorVersion: victorPackage.version,
    catalogHash: catalog.hash,
    cellCount: catalog.cells.size,
    publishedCount: published.length,
    redirectCount: catalog.redirects.size,
    publicationArchives: publicationArchives === null ? { enabled: false } : {
      enabled: true,
      pageSize: publicationArchives.pageSize,
      collectionCount: publicationArchives.collections.length,
      routeCount: publicationArchives.routes.length,
      collisionCount: publicationArchives.diagnostics.length,
    },
    browserAssets: browserAssets === null ? { enabled: false } : {
      enabled: true,
      valid: browserAssets.diagnostics.length === 0,
      transformedCount: browserAssets.mapping.length,
      manifestPath: assetConfig.manifestPath === false ? null : (assetConfig.manifestPath ?? 'asset-manifest.json'),
    },
    releaseCandidate: releaseManifest === null ? { enabled: false } : {
      enabled: true,
      path: releaseManifestPath,
      emitted: artifacts.has(releaseManifestPath),
      profile: releaseManifest.profile,
      digest: releaseManifest.digest,
      artifactCount: releaseManifest.artifactCount,
      byteCount: releaseManifest.byteCount,
      limits: releaseLimits,
    },
    staticSiteConformance: staticSiteConformance === null ? { enabled: false } : {
      enabled: true,
      valid: staticSiteConformance.valid,
      documentCount: staticSiteConformance.documentCount,
      linkCount: staticSiteConformance.linkCount,
      diagnosticCount: staticSiteConformance.diagnostics.length,
    },
    htmlConformance: htmlConformance === null ? { enabled: false } : {
      enabled: true,
      valid: htmlConformance.valid,
      documentCount: htmlConformance.documentCount,
      checks: htmlConformance.checks,
      refusalCount: htmlConformance.refusals.length,
      advisoryCount: htmlConformance.advisories.length,
    },
    projectorOrder,
    artifactProvenance: Object.fromEntries([...artifactRecords].map(([path, artifact]) => [path, artifact.provenance])),
    artifactHashes,
    refusals,
    advisories,
    releasable: refusals.length === 0,
  };
  return { artifacts, artifactRecords, report, catalog, site, application: publication };
}

function publisherProjectors() {
  return [{
      name: 'victor-public-assets', priority: 100,
      async project({ publicDir }) {
        const collected = await collectPublicAssets(publicDir);
        return {
          artifacts: [...collected.assets].map(([path, body]) => ({ path, body, source: `public:${path}` })),
          diagnostics: collected.refusals.map((item) => ({ severity: 'error', code: item.code, message: item.reason, subject: item.subject })),
        };
      },
  }];
}

function mergeFollowupProjection({ projection, name, priority, artifacts, artifactRecords, projectorOrder, refusals, advisories }) {
  projectorOrder.push({ name, priority });
  for (const diagnostic of projection.diagnostics) {
    const item = {
      code: diagnostic.code,
      subject: diagnostic.subject ?? name,
      reason: diagnostic.message,
      data: { projector: name, details: diagnostic.details },
    };
    if (diagnostic.severity === 'warning' || diagnostic.severity === 'info') advisories.push(item);
    else refusals.push(item);
  }
  for (const artifact of projection.artifacts) {
    if (artifacts.has(artifact.path)) {
      refusals.push({ code: 'R-01', subject: artifact.path, reason: `${name} cannot overwrite an existing artifact` });
      continue;
    }
    const record = Object.freeze({
      path: artifact.path,
      body: artifact.body,
      ...(artifact.mediaType === undefined ? {} : { mediaType: artifact.mediaType }),
      ...(artifact.cacheControl === undefined ? {} : { cacheControl: artifact.cacheControl }),
      provenance: Object.freeze({ projector: name, source: artifact.source ?? `${name}:generated` }),
    });
    artifactRecords.set(artifact.path, record);
    artifacts.set(artifact.path, artifact.body);
  }
}

function replaceArtifactInventory(replacement, artifacts, artifactRecords) {
  artifacts.clear();
  artifactRecords.clear();
  for (const artifact of replacement) {
    const record = Object.freeze({
      ...artifact,
      mediaType: artifact.mediaType ?? mediaTypeFor(artifact.path),
    });
    artifactRecords.set(artifact.path, record);
    artifacts.set(artifact.path, artifact.body);
  }
}

function discoveryRuntimePaths(discovery, baseIri) {
  const origin = new URL(baseIri).origin;
  return ['webmention', 'micropub', 'indieauthMetadata']
    .flatMap((key) => discovery[key] === undefined ? [] : [new URL(discovery[key], baseIri)])
    .filter((url) => url.origin === origin)
    .map((url) => `${url.pathname}${url.search}`);
}

export { DEFAULT_SITE } from './config.mjs';
import { sha256Base64Url } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

/**
 * Make outDir hold exactly this release. Files are written to a sibling staging
 * directory that then replaces outDir whole, so no earlier build's files linger
 * beside the release manifest. Only a missing or empty directory, or one VICTOR
 * wrote before (its build report sits beside it), is replaced.
 */
export async function writeArtifacts(artifacts, outDir) {
  const target = resolvePath(outDir);
  const existing = await readdir(target).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing?.length && !await stat(`${target}.report.json`).then(() => true, () => false)) {
    throw new Error(`${outDir} holds files VICTOR did not write; choose an empty or VICTOR-owned output directory.`);
  }
  const staging = `${target}.staging-${process.pid}`;
  const previous = `${target}.previous-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  for (const [path, content] of artifacts) {
    const full = join(staging, path);
    await mkdir(dirname(full), { recursive: true });
    if (typeof content === 'string') await writeFile(full, content, 'utf8');
    else await writeFile(full, content);
  }
  await mkdir(staging, { recursive: true });
  if (existing) await rename(target, previous);
  await rename(staging, target);
  if (existing) await rm(previous, { recursive: true, force: true });
}

/** Write VICTOR's private build record beside, rather than inside, the release directory. */
export async function writeBuildReport(report, outDir) {
  const reportPath = `${outDir}.report.json`;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return reportPath;
}

// residualReport(before, after): what regressed — new refusals, changed artifacts.
export function residualReport(before, after) {
  const beforeCodes = new Set(before.refusals.map((r) => `${r.code}:${r.subject}:${r.reason}`));
  const newRefusals = after.refusals.filter((r) => !beforeCodes.has(`${r.code}:${r.subject}:${r.reason}`));
  const changed = Object.keys(after.artifactHashes)
    .filter((p) => before.artifactHashes[p] !== after.artifactHashes[p]);
  const removed = Object.keys(before.artifactHashes).filter((p) => !(p in after.artifactHashes));
  return { newRefusals, changedArtifacts: changed, removedArtifacts: removed };
}
