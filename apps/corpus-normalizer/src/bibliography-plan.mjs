import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { bibtexDirectiveIdentity, markdownToBibtex, mergeBibtex, orgToBibtex, parseBibtex } from "./bibtex.mjs";
import { isGenerated } from "./detect.mjs";
import { walkOrderedTree } from "./inventory.mjs";

const digest = async (file) => {
  const hasher = createHash("sha256");
  for await (const chunk of createReadStream(file)) hasher.update(chunk);
  return hasher.digest("hex");
};
const contentHash = (content) => createHash("sha256").update(content).digest("hex");
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });
const positiveSafe = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
};
async function readTextBounded(file, limit, label) {
  const stat = await lstat(file);
  if (!stat.isFile()) throw new Error(`${label} is not a regular file`);
  if (stat.size > limit) throw new Error(`${label} exceeds byte limit ${limit}`);
  const bytes = await readFile(file);
  if (bytes.includes(0)) throw new Error(`${label} contains NUL bytes`);
  try { return strictUtf8.decode(bytes); } catch { throw new Error(`${label} is not valid UTF-8`); }
}

function parseSource(extension, content) {
  if (extension === ".bib") return parseBibtex(content);
  if (extension === ".md") return parseBibtex(markdownToBibtex(content).content);
  if (extension === ".org") return parseBibtex(orgToBibtex(content).content);
  throw new Error("unsupported bibliography source extension");
}
async function* selectedSourceEntries(sourceRoot, sourcePaths, chunkSize) {
  if (sourcePaths == null) { yield* walkOrderedTree(sourceRoot, { chunkSize, shouldTraverse: entry => !isGenerated(entry.path) }); return; }
  if (!Array.isArray(sourcePaths) || !sourcePaths.length) throw new Error("bibliography sourcePaths must be a nonempty array");
  const ordered = [...sourcePaths];
  if (ordered.some(item => typeof item !== "string") || ordered.some((item, index) => index && item <= ordered[index - 1]) || new Set(ordered).size !== ordered.length) throw new Error("bibliography sourcePaths must be unique code-unit sorted relative paths");
  for (const relative of ordered) {
    const absolutePath = path.resolve(sourceRoot, relative);
    if (!relative || path.isAbsolute(relative) || absolutePath === sourceRoot || !absolutePath.startsWith(`${sourceRoot}${path.sep}`)) throw new Error(`unsafe bibliography source path: ${relative}`);
    const stat = await lstat(absolutePath); yield { absolutePath, path: relative, type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "other" };
  }
}

function citationRecord(source, entry, disposition, against) {
  return {
    type: "citation",
    source,
    identity: entry.identity,
    citationKey: entry.key,
    bibtexType: entry.type,
    sha256: entry.hash,
    disposition,
    ...(against ? { against } : {}),
    status: disposition === "conflict-invalid" ? "invalid" : "proven",
  };
}

function directiveRecord(source, directive, disposition, against) {
  return {
    type: "directive",
    source,
    identity: bibtexDirectiveIdentity(directive),
    directiveType: directive.type,
    sha256: directive.hash,
    disposition,
    ...(against ? { against } : {}),
    status: disposition === "conflict-invalid" ? "invalid" : "proven",
  };
}

/**
 * Plan a bibliography aggregate without changing either source or destination.
 * Each regular source path is accounted for, followed by its parsed members.
 */
export async function* planBibliography(
  source,
  destination,
  { maxFiles = 100000, maxEntries = 100000, maxDirectives = 100000, maxSourceBytes = 16 * 1024 * 1024, maxAggregateBytes = 64 * 1024 * 1024, chunkSize = 128, sourcePaths = null } = {},
) {
  if (path.basename(destination) !== "bibliography.bib") {
    throw new Error("bibliography destination must be bibliography.bib");
  }
  positiveSafe(maxSourceBytes, "maxSourceBytes");
  positiveSafe(maxAggregateBytes, "maxAggregateBytes");

  const sourceRoot = path.resolve(source);
  const resolvedDestination = path.resolve(destination);
  let existingTarget = { state: "absent", sha256: null };
  let existing;
  let invalid = false;
  try {
    const targetStat = await lstat(resolvedDestination);
    existingTarget = { state: "present", sha256: null };
    if (!targetStat.isFile()) throw new Error("existing bibliography is not a regular file");
    if (targetStat.size > maxAggregateBytes) throw new Error(`existing bibliography exceeds byte limit ${maxAggregateBytes}`);
    existingTarget = { state: "present", sha256: await digest(resolvedDestination) };
    existing = parseBibtex(await readTextBounded(resolvedDestination, maxAggregateBytes, "existing bibliography"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      invalid = true;
      existingTarget = { ...existingTarget, parseError: String(error.message) };
    }
  }

  yield {
    type: "header",
    schema: "corpus-normalizer.bibliography-plan.v1",
    sourceRoot,
    destination: resolvedDestination,
    existingTarget,
  };

  const inputs = [];
  const citations = new Map();
  const directives = new Map();
  for (const entry of existing?.entries ?? []) citations.set(entry.identity, { ...entry, origin: "destination" });
  for (const directive of existing?.directives ?? []) directives.set(bibtexDirectiveIdentity(directive), { ...directive, origin: "destination" });

  let files = 0;
  let entries = 0;
  let directiveCount = 0;
  for await (const item of selectedSourceEntries(sourceRoot, sourcePaths, chunkSize)) {
    if (item.type === "directory") {
      if (isGenerated(item.path)) {
        invalid = true;
        yield { type: "source", source: item.path, status: "invalid", error: "generated bibliography source root" };
      }
      continue;
    }

    if (item.type !== "file") {
      invalid = true;
      yield { type: "source", source: item.path, status: "invalid", error: "incompatible bibliography source" };
      continue;
    }

    files += 1;
    if (files > maxFiles) {
      invalid = true;
      yield { type: "source", source: item.path, status: "invalid", error: "bibliography file limit exceeded" };
      continue;
    }
    const sourceStat = await lstat(item.absolutePath);
    if (sourceStat.size > maxSourceBytes) {
      invalid = true;
      yield { type: "source", source: item.path, status: "invalid", error: `bibliography source exceeds byte limit ${maxSourceBytes}` };
      continue;
    }
    const sourceHash = await digest(item.absolutePath);

    let parsed;
    try {
      parsed = parseSource(path.extname(item.absolutePath).toLowerCase(), await readTextBounded(item.absolutePath, maxSourceBytes, `bibliography source ${item.path}`));
    } catch (error) {
      invalid = true;
      yield { type: "source", source: item.path, sourceHash, status: "invalid", error: String(error.message) };
      continue;
    }

    inputs.push(parsed);
    yield {
      type: "source",
      source: item.path,
      sourceHash,
      status: "proven",
      entries: parsed.entries.length,
      directives: parsed.directives.length,
    };

    for (const entry of parsed.entries) {
      entries += 1;
      if (entries > maxEntries) {
        invalid = true;
        yield { ...citationRecord(item.path, entry, "conflict-invalid"), error: "bibliography citation limit exceeded" };
        continue;
      }
      const prior = citations.get(entry.identity);
      if (!prior) {
        citations.set(entry.identity, { ...entry, origin: item.path });
        yield citationRecord(item.path, entry, "proposed");
      } else if (prior.raw === entry.raw) {
        yield citationRecord(item.path, entry, "exact-covered", prior.origin);
      } else {
        invalid = true;
        yield citationRecord(item.path, entry, "conflict-invalid", prior.origin);
      }
    }

    for (const directive of parsed.directives) {
      directiveCount += 1;
      if (directiveCount > maxDirectives) {
        invalid = true;
        yield { ...directiveRecord(item.path, directive, "conflict-invalid"), error: "bibliography directive limit exceeded" };
        continue;
      }
      const identity = bibtexDirectiveIdentity(directive);
      const prior = directives.get(identity);
      if (!prior) {
        directives.set(identity, { ...directive, origin: item.path });
        yield directiveRecord(item.path, directive, "proposed");
      } else if (prior.raw === directive.raw) {
        yield directiveRecord(item.path, directive, "exact-covered", prior.origin);
      } else {
        invalid = true;
        yield directiveRecord(item.path, directive, "conflict-invalid", prior.origin);
      }
    }
  }

  try {
    const merged = mergeBibtex(inputs, existing);
    if (Buffer.byteLength(merged.content) > maxAggregateBytes) {
      yield { type: "aggregate", destination: resolvedDestination, status: "invalid", error: `bibliography aggregate exceeds byte limit ${maxAggregateBytes}` };
    } else if (invalid) {
      yield { type: "aggregate", destination: resolvedDestination, status: "invalid" };
    } else {
      yield {
        type: "aggregate",
        destination: resolvedDestination,
        status: "proven",
        content: merged.content,
        sha256: contentHash(merged.content),
      };
    }
  } catch (error) {
    yield { type: "aggregate", destination: resolvedDestination, status: "invalid", error: String(error.message) };
  }
}
