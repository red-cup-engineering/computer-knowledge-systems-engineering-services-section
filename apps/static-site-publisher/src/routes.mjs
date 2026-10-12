const READ_METHODS = Object.freeze(['GET', 'HEAD']);

/** Describe the concrete, in-memory routes projected by a VICTOR build. */
export function generatedRoutes(buildResult, artifactResource) {
  if (!(buildResult?.catalog?.redirects instanceof Map) || !(buildResult?.artifacts instanceof Map)) {
    throw new TypeError('VICTOR generated routes require a complete build result');
  }
  if (!artifactResource || typeof artifactResource.handler !== 'function') {
    throw new TypeError('VICTOR generated routes require an artifact resource');
  }

  const routes = [];
  for (const [name, target] of [...buildResult.catalog.redirects].sort(([a], [b]) => a.localeCompare(b))) {
    routes.push(Object.freeze({
      id: `victor-redirect:${name}`,
      source: 'redirect',
      pattern: publicPath(name),
      methods: READ_METHODS,
      handler: () => ({ status: 301, headers: { location: `${publicPath(target)}/` }, body: '' }),
    }));
  }

  for (const path of [...buildResult.artifacts.keys()].sort()) {
    routes.push(artifactRoute(path, `/${path}`, 'direct', artifactResource));
    if (path === 'index.html') {
      routes.push(artifactRoute(path, '/', 'index', artifactResource));
    } else if (path.endsWith('/index.html')) {
      routes.push(artifactRoute(path, publicPath(path.slice(0, -'/index.html'.length)), 'index', artifactResource));
    }
  }
  return Object.freeze(routes);
}

/** Project redirects into the shared engine's ordered resource table. */
export function generatedRouteApplication(routes) {
  return { resources: routes.filter((route) => route.source === 'redirect').map((route) => ({
    id: route.id, route: route.pattern, methods: route.methods,
    match: (path) => canonicalPattern(path) === canonicalPattern(route.pattern),
    handler: route.handler,
  })) };
}

/**
 * Produce an operator-facing manifest in actual dispatch order. Exact
 * method/path collisions remain visible; the first claimant is the winner.
 */
export function runtimeRouteManifest({ operations = [], applications = [], generated = [], fallback }) {
  const candidates = [
    ...resourceRoutes(operations, 'operation'),
    ...resourceRoutes(applications, 'application'),
    ...generated.map(({ handler: _handler, ...route }) => route),
    ...(fallback ? resourceRoutes([fallback], 'artifact-fallback') : []),
  ];
  const claims = new Map();
  return Object.freeze(candidates.map((candidate, precedence) => {
    const methods = Object.freeze([...(candidate.methods ?? READ_METHODS)]);
    const collisionKeys = methods.map((method) => `${method}:${canonicalPattern(candidate.pattern)}`);
    const shadowedBy = collisionKeys.map((key) => claims.get(key)).find(Boolean);
    const entry = Object.freeze({
      ...candidate,
      methods,
      precedence,
      ...(shadowedBy ? { shadowedBy } : {}),
    });
    for (const key of collisionKeys) if (!claims.has(key)) claims.set(key, entry.id);
    return entry;
  }));
}

function resourceRoutes(apps, source) {
  const routes = [];
  apps.forEach((app, appIndex) => {
    (app?.resources ?? []).forEach((resource, resourceIndex) => {
      const pattern = typeof resource.route === 'string'
        ? resource.route
        : typeof resource.match === 'string'
          ? resource.match
          : undefined;
      if (pattern === undefined) return;
      routes.push({
        id: resource.id ?? `victor-${source}:${appIndex}:${resourceIndex}`,
        source,
        pattern,
        methods: resource.methods ?? READ_METHODS,
      });
    });
  });
  return routes;
}

function artifactRoute(path, pattern, addressKind, artifactResource) {
  return Object.freeze({
    id: `victor-artifact:${path}:${addressKind}`,
    source: 'artifact',
    artifact: path,
    pattern,
    methods: READ_METHODS,
    handler: (context) => artifactResource.handler(context),
  });
}

function publicPath(name) {
  return `/${name}`.replace(/\/+$/, '') || '/';
}

function canonicalPattern(pattern) {
  return pattern === '/' ? pattern : pattern.replace(/\/+$/, '');
}
