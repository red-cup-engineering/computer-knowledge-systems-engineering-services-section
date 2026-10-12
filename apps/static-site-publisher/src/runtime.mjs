import { toWebRequest } from '@red-cup-engineering/http-services-section/web-bridge';
import { fetchApplication, mergeApps } from '@red-cup-engineering/computer-web-server/compose';
export { fetchApplication };
import { observability } from "@red-cup-engineering/computer-web-server/observability/preset";
import { healthResources } from '@red-cup-engineering/computer-web-server/edge/health';
import { artifactInventory } from '@red-cup-engineering/computer-systems-publishing-engineering-services-section/serve-http-artifact-inventory';
import { makeResolver } from '@red-cup-engineering/knowledge-system-server/catalog';
import { routeName } from '@red-cup-engineering/web-page-tiling-engine/publication';
import { renderBody } from '@red-cup-engineering/markdown-engineering-services-section/relational-markdown';
import { generatedRouteApplication, generatedRoutes, runtimeRouteManifest } from './routes.mjs';

export function publicationRecords({ catalog, site }) {
  const resolve = makeResolver(catalog.cells, catalog.redirects, { routeName });
  return [...catalog.cells.values()]
    .filter((cell) => cell.status !== 'potential' && cell.dateCreated)
    .sort((a, b) => b.dateCreated.localeCompare(a.dateCreated) || a.name.localeCompare(b.name))
    .map((cell) => Object.freeze({
      url: new URL(`${cell.name}/`, site.baseIri).href,
      title: cell.title,
      content: renderBody(cell.parsed, { resolve }),
      ...(cell.summary ? { summary: cell.summary } : {}),
      published: `${cell.dateCreated}T00:00:00Z`,
      tags: Object.freeze([...cell.tags]),
    }));
}


/** Whether a URL names an artifact of the current build: the question a Webmention receiver asks of the site. */
export function ownsVictorTarget(getBuild) {
  return (target) => {
    const url = target instanceof URL ? target : new URL(target);
    const build = getBuild();
    if (url.origin !== new URL(build.site.baseIri).origin) return false;
    let path;
    try { path = decodeURIComponent(url.pathname).replace(/^\/+/, ''); }
    catch { return false; }
    const artifact = path === '' ? 'index.html' : path.endsWith('/') ? `${path}index.html` : path;
    return build.artifacts instanceof Map
      && (build.artifacts.has(artifact) || (path !== '' && !path.endsWith('/') && build.artifacts.has(`${path}/index.html`)));
  };
}

/**
 * VICTOR's live site as an HTTP application, with the applications `applicationFactory(context)`
 * returns mounted beside it (the IndieWeb server's, ActivityPub's). The context carries the build,
 * `listPublications()`, `getBuild()`, `ownsTarget(url)` and `fetchApplication`.
 */
export async function createVictorApplication(buildResult, applicationFactory, options = {}) {
  let currentBuild = buildResult;
  const listPublications = () => publicationRecords(currentBuild);
  const context = Object.freeze({
    ...buildResult,
    publications: Object.freeze(listPublications()),
    listPublications,
    getBuild: () => currentBuild,
    ownsTarget: ownsVictorTarget(() => currentBuild),
    fetchApplication,
  });
  const value = typeof applicationFactory === 'function'
    ? await applicationFactory(context)
    : applicationFactory;
  const applications = value === undefined ? [] : Array.isArray(value) ? value : [value];
  for (const application of applications) {
    if (!application || typeof application !== 'object') {
      throw new TypeError('VICTOR runtime applications must be HTTP application objects');
    }
  }

  const liveInventory = {
    has: (path) => currentBuild.artifacts.has(path),
    get: (path) => currentBuild.artifactRecords?.get(path) ?? currentBuild.artifacts.get(path),
  };
  const artifacts = artifactInventory(liveInventory, { notFoundPath: '404.html' });
  let projectedRoutes = generatedRoutes(currentBuild, artifacts.resources[0]);
  let projected = generatedRouteApplication(projectedRoutes);
  const observation = options.observability === false
    ? undefined
    : observability(options.observability ?? { metrics: { path: false } });
  const probes = options.probes === false
    ? undefined
    : victorProbes(() => currentBuild, options.probes ?? {});
  const app = mergeApps(
    ...(observation ? [observation] : []),
    ...(probes ? [probes] : []),
    ...applications,
    projected,
    artifacts,
  );
  const projectedStart = [observation, probes, ...applications]
    .filter(Boolean)
    .reduce((count, application) => count + (application.resources?.length ?? 0), 0);
  let projectedCount = projected.resources.length;
  Object.defineProperty(app, 'observability', {
    enumerable: false,
    value: observation,
  });
  Object.defineProperty(app, 'updateBuild', {
    enumerable: false,
    value(nextBuild) {
      if (!nextBuild?.artifacts || !nextBuild?.catalog?.redirects) {
        throw new TypeError('VICTOR runtime update requires a complete build result');
      }
      currentBuild = nextBuild;
      projectedRoutes = generatedRoutes(currentBuild, artifacts.resources[0]);
      projected = generatedRouteApplication(projectedRoutes);
      app.resources.splice(projectedStart, projectedCount, ...projected.resources);
      projectedCount = projected.resources.length;
    },
  });
  Object.defineProperty(app, 'routeManifest', {
    enumerable: false,
    get() {
      return runtimeRouteManifest({
        operations: [observation, probes].filter(Boolean),
        applications,
        generated: projectedRoutes,
        fallback: artifacts,
      });
    },
  });
  return app;
}

function victorProbes(getBuild, options) {
  const catalogCheck = {
    name: 'catalog',
    check: () => {
      const build = getBuild();
      const loaded = build?.catalog?.cells instanceof Map;
      return {
        status: loaded ? 'pass' : 'fail',
        evidence: [loaded ? 'catalog:loaded' : 'catalog:unavailable'],
        data: { records: loaded ? build.catalog.cells.size : 0 },
      };
    },
  };
  const releaseCheck = {
    name: 'release',
    check: () => {
      const build = getBuild();
      const releasable = build?.report?.releasable === true;
      return {
        status: releasable ? 'pass' : 'fail',
        evidence: [releasable ? 'release:releasable' : 'release:refused'],
        data: {
          artifacts: build?.artifacts?.size ?? 0,
          refusals: build?.report?.refusals?.length ?? 0,
        },
      };
    },
  };
  const { health = [], ready = [], ...resourceOptions } = options;
  return {
    resources: healthResources({
      now: () => new Date(),
      ...resourceOptions,
      health: [catalogCheck, ...health],
      ready: [catalogCheck, releaseCheck, ...ready],
    }),
  };
}
