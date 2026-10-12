function isArtifactBody(value) {
  return typeof value === "string" || value instanceof Uint8Array;
}

function validPath(path) {
  return typeof path === "string"
    && path.length > 0
    && !path.startsWith("/")
    && !path.includes("\\")
    && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function diagnostic({ severity = "error", code, message, subject, projector, details }) {
  const result = { severity, code, message };
  if (subject !== undefined) result.subject = subject;
  if (projector !== undefined) result.projector = projector;
  if (details !== undefined) result.details = details;
  return Object.freeze(result);
}

function normalizeDiagnostic(value, projector) {
  if (!value || typeof value !== "object" || typeof value.code !== "string" || typeof value.message !== "string") {
    return diagnostic({
      code: "BPC-005",
      message: "projector returned a malformed diagnostic",
      projector,
    });
  }
  const severity = ["error", "warning", "info"].includes(value.severity) ? value.severity : "error";
  return diagnostic({ ...value, severity, projector });
}

function artifactEntries(artifacts) {
  if (artifacts === undefined) return [];
  if (artifacts instanceof Map) return [...artifacts].map(([path, body]) => ({ path, body }));
  if (typeof artifacts[Symbol.iterator] !== "function") return undefined;
  return [...artifacts].map((entry) => Array.isArray(entry) ? { path: entry[0], body: entry[1] } : entry);
}

function values(value) {
  if (value === undefined) return [];
  return value && typeof value[Symbol.iterator] === "function" ? value : undefined;
}

function orderedProjectors(projectors, diagnostics) {
  if (!Array.isArray(projectors)) {
    diagnostics.push(diagnostic({ code: "BPC-001", message: "projectors must be an array" }));
    return [];
  }
  const names = new Set();
  return projectors
    .map((projector) => ({ projector, name: projector?.name, priority: projector?.priority ?? 0 }))
    .sort((a, b) => a.priority - b.priority || String(a.name).localeCompare(String(b.name)))
    .filter((candidate) => {
      if (!candidate.projector || typeof candidate.name !== "string" || candidate.name.length === 0
        || !Number.isFinite(candidate.priority) || typeof candidate.projector.project !== "function") {
        diagnostics.push(diagnostic({ code: "BPC-001", message: "a projector needs a name, finite priority, and project(context) function", projector: candidate.name }));
        return false;
      }
      if (names.has(candidate.name)) {
        diagnostics.push(diagnostic({ code: "BPC-001", message: "projector names must be unique", projector: candidate.name }));
        return false;
      }
      names.add(candidate.name);
      return true;
    });
}

/**
 * Run independent build projectors in a stable order and combine their release
 * artifacts. A collision is an error: the first artifact is retained only so
 * consumers can inspect every non-conflicting result and its provenance.
 *
 * @param {readonly {name: string, priority?: number, project(context: object): object | Promise<object>}[]} projectors
 * @param {object} [context]
 */
export async function projectArtifacts(projectors, context = {}) {
  const diagnostics = [];
  const candidates = new Map();
  const order = orderedProjectors(projectors, diagnostics);

  for (const { projector, name, priority } of order) {
    let contribution;
    try {
      contribution = await projector.project(context);
    } catch (error) {
      diagnostics.push(diagnostic({
        code: "BPC-004",
        message: "projector threw while producing artifacts",
        projector: name,
        details: { name: error?.name ?? "Error", message: error?.message ?? String(error) },
      }));
      continue;
    }
    if (!contribution || typeof contribution !== "object") {
      diagnostics.push(diagnostic({ code: "BPC-002", message: "projector must return a contribution object", projector: name }));
      continue;
    }
    const contributedDiagnostics = values(contribution.diagnostics);
    if (contributedDiagnostics === undefined) {
      diagnostics.push(diagnostic({ code: "BPC-002", message: "contribution diagnostics must be iterable", projector: name }));
    } else {
      for (const value of contributedDiagnostics) diagnostics.push(normalizeDiagnostic(value, name));
    }
    const entries = artifactEntries(contribution.artifacts);
    if (entries === undefined) {
      diagnostics.push(diagnostic({ code: "BPC-002", message: "contribution artifacts must be a Map or iterable", projector: name }));
      continue;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !validPath(entry.path) || !isArtifactBody(entry.body)) {
        diagnostics.push(diagnostic({ code: "BPC-002", message: "artifact needs a safe relative path and a string or Uint8Array body", projector: name, subject: entry?.path }));
        continue;
      }
      const artifact = {
        path: entry.path,
        body: entry.body,
        provenance: Object.freeze({
          projector: name,
          priority,
          ...(entry.source === undefined ? {} : { source: entry.source }),
        }),
      };
      if (entry.mediaType !== undefined) artifact.mediaType = entry.mediaType;
      if (entry.cacheControl !== undefined) artifact.cacheControl = entry.cacheControl;
      Object.freeze(artifact);
      const existing = candidates.get(entry.path);
      if (existing) {
        diagnostics.push(diagnostic({
          code: "BPC-003",
          message: "multiple projectors contributed the same artifact path",
          subject: entry.path,
          projector: name,
          details: { retained: existing.provenance.projector, rejected: name },
        }));
        continue;
      }
      candidates.set(entry.path, artifact);
    }
  }

  const artifacts = new Map([...candidates].sort(([a], [b]) => a.localeCompare(b)));
  const errors = diagnostics.filter((entry) => entry.severity === "error");
  const warnings = diagnostics.filter((entry) => entry.severity === "warning");
  return Object.freeze({
    artifacts,
    diagnostics: Object.freeze(diagnostics),
    report: Object.freeze({
      projectorOrder: Object.freeze(order.map(({ name, priority }) => Object.freeze({ name, priority }))),
      artifactCount: artifacts.size,
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
      releasable: errors.length === 0,
    }),
  });
}
