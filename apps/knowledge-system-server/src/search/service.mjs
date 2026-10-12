/**
 * src/search/service - host-backed evidence collection for the term-intension
 * readout owned by this package.
 */
import path from "node:path";

import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

import { exactTermIntensionMatch, normalizeTermQuery, deriveTermIntensionReadout, textMatchesTermIntension } from "@red-cup-engineering/knowledge-system-server/search/standing";
import { termIntensionReadoutContract, termIntensionRequestContract } from "@red-cup-engineering/knowledge-system-server/search/schema";
import { conceptResolutionsAt } from "@red-cup-engineering/knowledge-system-server/search/concept-resolution";
import { markdownDataform } from "@red-cup-engineering/markdown-engineering-services-section/markdown-projector";
import { readModuleTopology } from "@red-cup-engineering/computer-code-development-engine/monitoring/source-code/topology/service";
import { readLeanWorkspaceTopic } from "@red-cup-engineering/feltos/lean/workspace/service";
import { readPathCorpus } from "@red-cup-engineering/knowledge-system-server/search/path-corpus";

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 200;
const MAX_MARKDOWN_FILES = 800;
const PRUNE_DIRS = new Set([".git", ".pnpm-store", ".tmp", "dist", "node_modules"]);
const MARKDOWN_FILE = /\.(?:md|markdown)$/iu;

function clampLimit(value) {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function relativePath(root, full) {
  const value = path.relative(root, full).split(path.sep).join("/");
  return value === "" ? "." : value;
}

function resolveWithin(root, requested) {
  const rootAbs = path.resolve(root);
  const target = requested === undefined || requested === "" ? rootAbs : path.resolve(rootAbs, requested);
  const relative = path.relative(rootAbs, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return target;
  return undefined;
}

function pushUnique(items, item) {
  if (!items.some((entry) => entry.id === item.id)) items.push(item);
}

function matchedGrade(field, value, normalized, fallback) {
  if (exactTermIntensionMatch(value, normalized)) return "strong";
  if (field === "body" || field === "excerpt") return "weak";
  return fallback;
}

function fieldValues(frontmatter, keys) {
  const values = [];
  for (const key of keys) {
    const value = frontmatter[key];
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string") values.push(entry);
    }
  }
  return Object.freeze(values);
}

function headingsOf(body) {
  return Object.freeze(body.split(/\r?\n/u)
    .map((line) => /^#{1,6}\s+(.+)$/u.exec(line.trim())?.[1]?.trim())
    .filter((value) => value !== undefined && value.length > 0));
}

function excerptOf(text, normalized) {
  const compact = text.replace(/\s+/gu, " ").trim();
  if (compact.length <= 360) return compact;
  const lower = compact.toLowerCase();
  const first = normalized.variants
    .map((variant) => lower.indexOf(variant))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, first - 80);
  return `${start === 0 ? "" : "..."}${compact.slice(start, start + 360)}...`;
}

function lensAttributesForText(value) {
  const terms = new Set(value.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/gu) ?? []);
  const lenses = [];
  if (["causal", "event", "packet", "phase", "carrier", "region", "hole", "shroud", "plate", "settlement", "cohomology", "h1"].some((term) => terms.has(term))) {
    lenses.push("physical/material");
  }
  if (["term", "sen", "type", "class", "interface", "function", "codec", "schema", "action", "module", "declaration"].some((term) => terms.has(term))) {
    lenses.push("computing/term");
  }
  if (["tag", "alias", "title", "topic", "concept", "intension", "reference", "wikilink", "term"].some((term) => terms.has(term))) {
    lenses.push("semiotic/intensional");
  }
  if (["arena", "move", "strategy", "play", "game", "ludic", "authority", "actor"].some((term) => terms.has(term))) {
    lenses.push("ludic/game");
  }
  return Object.freeze(lenses.length === 0 ? ["semiotic/intensional"] : lenses);
}

function scanConceptResolutionRows(root, normalized, limit)

 {
  const anchors = [];
  const occurrences = [];
  for (const resolution of conceptResolutionsAt(root)) {
      if (!textMatchesTermIntension(resolution.term, normalized)) continue;
      for (const target of resolution.canonicalFiles.slice(0, limit)) {
        anchors.push(Object.freeze({
          term: resolution.term,
          source: "concept-resolve",
          target,
          sharedAttribute: resolution.sharedAttribute,
          evidence: Object.freeze([`resolved-by:${resolution.resolvedBy}`, "source:journal/concept-resolve"]),
        }));
      }
      pushUnique(occurrences, Object.freeze({
        id: `concept-resolution:${resolution.term}`,
        source: "concept-resolution",
        grade: "strong",
        matchedFields: Object.freeze(["term", "resolved-as"]),
        attributes: Object.freeze([`shared:${resolution.sharedAttribute}`, `resolved-by:${resolution.resolvedBy}`]),
        lenses: Object.freeze(["semiotic/intensional"]),
        evidence: Object.freeze(["source:journal/concept-resolve", `canonical-files:${resolution.canonicalFiles.length}`]),
      }));
  }
  return Object.freeze({ anchors: Object.freeze(anchors.slice(0, limit)), occurrences: Object.freeze(occurrences.slice(0, limit)) });
}

function scanMarkdown(root, normalized, includeBody, limit, options)

 {
  const markdownFiles = options.walkFiles(root, {
    pruneDirectory: (name) => PRUNE_DIRS.has(name),
    includeFile: (name) => MARKDOWN_FILE.test(name),
    skipSymbolicLinks: true,
  }).slice(0, MAX_MARKDOWN_FILES);
  const files = {};
  const occurrences = [];
  const open = [];
  for (const file of markdownFiles) {
    const rel = relativePath(root, file);
    let text;
    try {
      text = options.readFileUtf8(file);
      files[rel] = text;
    } catch {
      continue;
    }
    let dataform;
    try {
      dataform = markdownDataform(text, { coordinate: rel });
    } catch (error) {
      open.push(`markdown:${rel}:${(error).message}`);
      continue;
    }
    const candidates = [
      ...fieldValues(dataform.frontmatter, ["title", "name", "headline"]).map((value) => ({ field: "title", value, fallback: "medium" })),
      ...fieldValues(dataform.frontmatter, ["aliases", "alias"]).map((value) => ({ field: "alias", value, fallback: "medium" })),
      ...fieldValues(dataform.frontmatter, ["tags", "keywords", "categories", "category"]).map((value) => ({ field: "tag", value, fallback: "medium" })),
      ...headingsOf(dataform.body).map((value) => ({ field: "heading", value, fallback: "medium" })),
      ...(includeBody ? [{ field: "body", value: dataform.body, fallback: "weak" }] : []),
    ];
    const matched = candidates.filter((candidate) => textMatchesTermIntension(candidate.value, normalized));
    if (matched.length === 0) continue;
    const grade = matched.reduce((best, candidate) => {
      const grade0 = matchedGrade(candidate.field, candidate.value, normalized, candidate.fallback);
      if (best === "strong" || grade0 === "weak") return best;
      if (grade0 === "strong" || best === "weak") return grade0;
      return "medium";
    }, "weak");
    const fields = [...new Set(matched.map((entry) => entry.field))].sort();
    pushUnique(occurrences, Object.freeze({
      id: `markdown:${rel}`,
      source: "markdown",
      grade,
      path: rel,
      matchedFields: Object.freeze(fields),
      attributes: Object.freeze([
        `path:${rel}`,
        `format:${dataform.format ?? "none"}`,
        `assertions:${dataform.assertions.length}`,
        ...fields.map((field) => `markdown:${field}`),
      ]),
      lenses: lensAttributesForText(`${rel} ${matched.map((entry) => `${entry.field} ${entry.value}`).join(" ")}`),
      ...(includeBody && fields.includes("body") ? { excerpt: excerptOf(dataform.body, normalized) } : {}),
      evidence: Object.freeze([`path:${rel}`, `matched-fields:${fields.join(",")}`]),
    }));
  }
  return Object.freeze({
    files: Object.freeze(files),
    occurrences: Object.freeze(occurrences.slice(0, limit)),
    open: Object.freeze(open),
  });
}

function scanTypeScript(packageRoot, normalized, limit, options) {
  if (packageRoot === undefined || options.statPathOrNull(packageRoot)?.isDirectory() !== true) return Object.freeze([]);
  let topology;
  try {
    topology = readModuleTopology(packageRoot, options);
  } catch {
    return Object.freeze([]);
  }
  const occurrences = [];
  for (const moduleEntry of topology.modules) {
    for (const symbol of moduleEntry.symbols) {
      const summary = symbol.summary ?? "";
      const nameMatch = textMatchesTermIntension(symbol.name, normalized);
      const summaryMatch = summary !== "" && textMatchesTermIntension(summary, normalized);
      const dependencyMatch = symbol.dependsOnModules.some((entry) => textMatchesTermIntension(entry, normalized))
        || symbol.dependsOnLocal.some((entry) => textMatchesTermIntension(entry, normalized));
      if (!nameMatch && !summaryMatch && !dependencyMatch) continue;
      const grade = nameMatch && exactTermIntensionMatch(symbol.name, normalized) ? "strong" : nameMatch || summaryMatch ? "medium" : "weak";
      const fields = [
        ...(nameMatch ? ["symbol"] : []),
        ...(summaryMatch ? ["summary"] : []),
        ...(dependencyMatch ? ["dependency"] : []),
      ];
      pushUnique(occurrences, Object.freeze({
        id: `typescript:${moduleEntry.path}:${symbol.name}`,
        source: "typescript",
        grade,
        path: moduleEntry.path,
        symbol: symbol.name,
        line: symbol.line,
        matchedFields: Object.freeze(fields),
        attributes: Object.freeze([
          `symbol-kind:${symbol.kind}`,
          `module:${moduleEntry.path}`,
          ...symbol.dependsOnModules.map((entry) => `depends-module:${entry}`),
          ...symbol.dependsOnLocal.map((entry) => `depends-local:${entry}`),
        ]),
        lenses: Object.freeze(["computing/term", ...lensAttributesForText(`${symbol.name} ${summary}`)]),
        ...(summary === "" ? {} : { excerpt: summary }),
        evidence: Object.freeze([`module:${moduleEntry.path}`, `symbol:${symbol.name}`, `line:${symbol.line}`]),
      }));
    }
  }
  return Object.freeze(occurrences.slice(0, limit));
}

function scanLean(obsmetrologiaRoot, normalized, limit, options)

 {
  if (obsmetrologiaRoot === undefined || options.statPathOrNull(obsmetrologiaRoot)?.isDirectory() !== true) {
    return Object.freeze({ occurrences: Object.freeze([]), open: Object.freeze(["lean:obsmetrologia-root-missing"]) });
  }
  try {
    const topic = readLeanWorkspaceTopic(obsmetrologiaRoot, { ...options, terms: [normalized.phrase, normalized.pascal, normalized.kebab], maxReferencesPerFile: 8 });
    const searchTerms = topic.searchTerms ?? Object.freeze([normalized.phrase, normalized.pascal, normalized.kebab]);
    const occurrences = [];
    for (const module of topic.modules) {
      for (const declaration of module.declarations) {
        const declarationMatch = textMatchesTermIntension(declaration.name, normalized);
        if (!declarationMatch && !searchTerms.some((term) => module.id.toLowerCase().includes(term.toLowerCase()))) continue;
        pushUnique(occurrences, Object.freeze({
          id: `lean:${module.id}:${declaration.name}`,
          source: "lean",
          grade: declarationMatch ? "strong" : "medium",
          ...(module.path === undefined ? {} : { path: module.path }),
          module: module.id,
          declaration: declaration.name,
          ...(declaration.line === undefined ? {} : { line: declaration.line }),
          matchedFields: Object.freeze(declarationMatch ? ["declaration"] : ["topic"]),
          attributes: Object.freeze([
            `lean-kind:${declaration.kind}`,
            `proof-status:${declaration.proofStatus ?? "unknown"}`,
            `module:${module.id}`,
          ]),
          lenses: lensAttributesForText(`${module.id} ${declaration.name}`),
          evidence: Object.freeze([`module:${module.id}`, `declaration:${declaration.name}`]),
        }));
      }
    }
    for (const reference of topic.references) {
      pushUnique(occurrences, Object.freeze({
        id: `lean-reference:${reference.path}:${reference.line}`,
        source: "lean",
        grade: "medium",
        path: reference.path,
        line: reference.line,
        matchedFields: Object.freeze(["reference"]),
        attributes: Object.freeze([`reference-source:${reference.path}`]),
        lenses: lensAttributesForText(`${reference.path} ${reference.snippet}`),
        excerpt: reference.snippet,
        evidence: Object.freeze([`source:${reference.path}`, `line:${reference.line}`]),
      }));
    }
    return Object.freeze({ occurrences: Object.freeze(occurrences.slice(0, limit)), open: Object.freeze([]) });
  } catch (error) {
    return Object.freeze({ occurrences: Object.freeze([]), open: Object.freeze([`lean:${(error).message}`]) });
  }
}

function scanPathCorpus(root, normalized, limit, options) {
  try {
    const corpus = readPathCorpus(root, { ...options, query: normalized.phrase, limit: Math.min(limit, 24) });
    return Object.freeze(corpus.documents
      .filter((document) => document.score > 0)
      .map((document) => Object.freeze({
        id: `path-corpus:${document.path}`,
        source: "path-corpus",
        grade: "weak",
        path: document.path,
        matchedFields: Object.freeze(["excerpt"]),
        attributes: Object.freeze([
          `role:${document.role}`,
          `language:${document.language}`,
          `material-class:${document.materialClass}`,
          ...document.matchedTerms.map((term) => `matched-term:${term}`),
        ]),
        lenses: lensAttributesForText(`${document.path} ${document.symbols.join(" ")} ${document.headings.join(" ")}`),
        excerpt: document.excerpt,
        evidence: Object.freeze([`score:${document.score}`, `path:${document.path}`]),
      }))
      .slice(0, limit));
  } catch {
    return Object.freeze([]);
  }
}

export function readTermIntension(options) {
  const root = path.resolve(options.root ?? ".");
  const targetRoot = resolveWithin(root, options.pathPrefix);
  if (targetRoot === undefined) {
    throw new RangeError(`term-intension: pathPrefix escapes root: ${options.pathPrefix}`);
  }
  const limit = clampLimit(options.limit);
  const normalized = normalizeTermQuery(options.query);
  const concept = scanConceptResolutionRows(root, normalized, limit);
  const markdown = scanMarkdown(targetRoot, normalized, options.includeBody === true, limit, options);
  const packageRoot = options.packageRoot ?? (options.pathExists(path.join(targetRoot, "package.json")) ? targetRoot : undefined);
  const ts = scanTypeScript(packageRoot, normalized, limit, options);
  const lean = scanLean(options.obsmetrologiaRoot, normalized, limit, options);
  const pathCorpus = scanPathCorpus(targetRoot, normalized, limit, options);
  const occurrences = [
    ...concept.occurrences,
    ...markdown.occurrences,
    ...ts,
    ...lean.occurrences,
    ...pathCorpus,
  ].slice(0, limit);
  const readout = deriveTermIntensionReadout({
    query: options.query,
    occurrences,
    anchors: concept.anchors,
    open: Object.freeze([
      ...markdown.open,
      ...lean.open,
      ...(markdown.occurrences.length === 0 ? ["markdown:no-structured-match"] : []),
      ...(ts.length === 0 ? ["typescript:no-symbol-match"] : []),
    ]),
  });
  return termIntensionReadoutContract.assert(readout, "term intension readout");
}

export function termIntensionOperations(binding) {
  return Object.freeze([
    operation({
      verb: "term-intension",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Settle a term's secondary intension from local workspace evidence.",
      description: "Domain: { query, root?, obsmetrologiaRoot?, pathPrefix?, limit?, includeBody? }. Reads markdown, concept-resolution rows, TypeScript topology, Lean workspace topics, and path-corpus evidence under the requested root.",
      domain: termIntensionRequestContract,
      codomain: termIntensionReadoutContract,
      run: (input) => {
        const request = termIntensionRequestContract.assert(input, "term-intension input");
        return readTermIntension({
          ...binding,
          ...request,
          root: request.root ?? binding.dataRoot,
          ...(binding.packageRoot === undefined ? {} : { packageRoot: binding.packageRoot }),
        });
      },
    }),
  ]);
}
