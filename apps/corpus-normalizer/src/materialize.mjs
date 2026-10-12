import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, opendir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { changeFromDecision, createChangeManifestWriter, iterateChangeManifest, verifyChangeManifest } from "./change-manifest.mjs";
import { formFor } from "./forms.mjs";
import { walkOrderedTree } from "./inventory.mjs";
import { readPlanLines } from "./plan.mjs";
import { sha256, validateTerm } from "./term.mjs";
import { verifyTreeManifest, writeTreeManifest } from "./tree-manifest.mjs";

const fail = (message) => { throw new Error(message); };
const overlaps = (a, b) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
const manifestPath = (root) => `${path.resolve(root)}.corpus-normalizer-run.json`;
const changePath = (root) => `${path.resolve(root)}.corpus-normalizer-changes.ndjson`;
const treePath = (root) => `${path.resolve(root)}.corpus-normalizer-tree.ndjson`;
async function hashFile(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
function safeRelative(root, target) { const relative = path.relative(root, target); if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail(`unsafe proposed output: ${target}`); return relative; }

async function scanPlan(planFile, output) {
  let destination = null; let form = null; let writes = 0; let seen = 0;
  for await (const decision of readPlanLines(planFile)) {
    seen += 1;
    if (!decision.sourceRoot || !decision.destination || !decision.destinationForm) fail(`plan decision lacks transaction roots: ${decision.input}`);
    const nextDestination = path.resolve(decision.destination);
    if (destination && destination !== nextDestination) fail("plan has multiple destinations");
    if (form && form !== decision.destinationForm) fail("plan has multiple destination forms");
    destination = nextDestination; form = decision.destinationForm;
    if (output) for (const protectedRoot of [decision.sourceRoot, decision.destination].map((item) => path.resolve(item))) if (overlaps(output, protectedRoot)) fail(`materialize output must be outside source and destination: ${output}`);
    if (decision.status !== "proven") fail(`plan has unresolved or invalid decision: ${decision.input}: ${decision.status} ${decision.decision}`);
    if (["write", "copy"].includes(decision.proposed?.action)) writes += 1;
  }
  if (!seen || !destination || !form) fail("empty plan");
  return { destination, form, writes };
}

async function copyTree(source, target, includeExisting) {
  for await (const entry of walkOrderedTree(source, { shouldTraverse: includeExisting })) {
    if (includeExisting && !includeExisting(entry)) continue;
    if (entry.type === "symlink" || !["directory", "file"].includes(entry.type)) fail(`unsupported destination node: ${entry.path}`);
    const to = path.join(target, entry.path);
    if (entry.type === "directory") await mkdir(to, { recursive: true, mode: entry.mode });
    else { await mkdir(path.dirname(to), { recursive: true }); await copyFile(entry.absolutePath, to); }
  }
}
async function pruneEmptyWithin(directory, sourceRoot) { let current = path.resolve(directory); const boundary = path.resolve(sourceRoot); while (current === boundary || current.startsWith(`${boundary}${path.sep}`)) { try { await rm(current, { recursive: false }); } catch { break; } if (current === boundary) break; current = path.dirname(current); } }
async function readHeader(root) { return JSON.parse(await readFile(manifestPath(root), "utf8")); }

async function authenticate(planFile, materializedRoot) {
  const header = await readHeader(materializedRoot); const materialized = path.resolve(materializedRoot);
  if (header.planHash !== await hashFile(planFile)) fail("plan changed after materialization");
  if (header.plan !== path.resolve(planFile) || header.materialized !== materialized) fail("manifest materialized path mismatch");
  const scanned = await scanPlan(planFile);
  if (header.destination !== scanned.destination || header.form !== scanned.form) fail("manifest does not match plan");
  if (!header.changes || header.changes.path !== changePath(materialized)) fail("manifest change sidecar path mismatch");
  if (!(await verifyChangeManifest(planFile, header.changes.path, header.changes)).valid) fail("manifest change sidecar does not match plan");
  if (!header.tree || header.tree.path !== treePath(materialized)) fail("manifest tree sidecar path mismatch");
  const handler = formFor(header.form); if (!(await verifyTreeManifest(materialized, header.tree.path, { ...header.tree, includeExisting: handler?.includeExisting })).valid) fail("materialized tree sidecar does not match projection");
  return { header, scanned };
}

export async function materializePlan(planFile, outputRoot) {
  const output = path.resolve(outputRoot); const headerFile = manifestPath(output); const sidecar = changePath(output); const treeSidecar = treePath(output); const planHash = await hashFile(planFile); const scanned = await scanPlan(planFile, output);
  try { const existing = await opendir(output); try { for await (const _entry of existing) fail(`materialize output must be absent or empty: ${output}`); } finally { await existing.close().catch(() => {}); } } catch (error) { if (error.code !== "ENOENT") throw error; }
  const handler = formFor(scanned.form); if (!handler) fail(`no materializer validator for form: ${scanned.form}`); let writer;
  try {
    await mkdir(output, { recursive: true }); try { await copyTree(scanned.destination, output, handler.includeExisting); } catch (error) { if (error.code !== "ENOENT") throw error; }
    writer = await createChangeManifestWriter(sidecar);
    for await (const decision of readPlanLines(planFile)) {
      const change = changeFromDecision(decision); if (!change) continue;
      if (["write", "copy"].includes(decision.proposed.action)) {
        if (await hashFile(decision.sourcePath) !== decision.proposed.sourceContentSha256) fail(`source changed since plan: ${decision.input}`);
        const projected = path.join(output, safeRelative(scanned.destination, decision.proposed.output)); await mkdir(path.dirname(projected), { recursive: true });
        if (decision.proposed.action === "copy") { await copyFile(decision.sourcePath, projected); if (decision.proposed.mode != null) await chmod(projected, decision.proposed.mode); }
        else { if (sha256(decision.proposed.content) !== decision.proposed.proposedContentSha256) fail(`proposed content hash mismatch: ${decision.input}`); await writeFile(projected, decision.proposed.content, "utf8"); }
      }
      await writer.write(change);
    }
    const changes = await writer.close(); writer = null;
    const validation = await handler.validate(output, { projected: true }); if (!validation.valid) fail(`materialized output failed validation:\n${validation.errors.join("\n")}`);
    const writtenTree = await writeTreeManifest(output, treeSidecar, { includeExisting: handler.includeExisting }); const tree = { path: treeSidecar, hash: writtenTree.hash, count: writtenTree.count };
    const header = { version: 4, form: scanned.form, plan: path.resolve(planFile), planHash, destination: scanned.destination, materialized: output, changes, validation, tree };
    await writeFile(headerFile, JSON.stringify(header, null, 2));
    return { output, manifest: headerFile, writes: scanned.writes, warnings: validation.warnings };
  } catch (error) { await writer?.abort(); await rm(output, { recursive: true, force: true }); await rm(headerFile, { force: true }); await rm(sidecar, { force: true }); await rm(treeSidecar, { force: true }); throw error; }
}

export async function applyPlan(planFile, materializedRoot) {
  let { header } = await authenticate(planFile, materializedRoot); const handler = formFor(header.form);
  if (!handler || !(await handler.validate(materializedRoot, { projected: true })).valid) fail("materialization is no longer valid");
  for await (const change of iterateChangeManifest(header.changes.path)) {
    if (await hashFile(change.sourcePath) !== change.sourceHash) fail(`source changed after plan: ${change.sourcePath}`);
    try { const actual = await hashFile(change.target); if (actual !== change.targetBefore && actual !== change.targetAfter) fail(`destination changed after plan: ${change.target}`); } catch (error) { if (change.targetBefore || error.code !== "ENOENT") throw error; }
  }
  ({ header } = await authenticate(planFile, materializedRoot));
  await mkdir(header.destination, { recursive: true });
  for await (const change of iterateChangeManifest(header.changes.path)) if (!change.covered) {
    const projected = path.join(path.resolve(materializedRoot), safeRelative(header.destination, change.target)); if (await hashFile(projected) !== change.targetAfter) fail(`materialized target changed: ${projected}`);
    await mkdir(path.dirname(change.target), { recursive: true }); await copyFile(projected, change.target); if (change.action === "copy" && change.modeAfter != null) await chmod(change.target, change.modeAfter);
  }
  await verifyPlan(planFile, materializedRoot);
  ({ header } = await authenticate(planFile, materializedRoot));
  for await (const change of iterateChangeManifest(header.changes.path)) {
    if (overlaps(path.resolve(change.sourcePath), header.destination)) continue;
    try { if (await hashFile(change.target) === change.targetAfter && await hashFile(change.sourcePath) === change.sourceHash) { await unlink(change.sourcePath); await pruneEmptyWithin(path.dirname(change.sourcePath), change.sourceRoot); } } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return verifyPlan(planFile, materializedRoot);
}

export async function verifyPlan(planFile, materializedRoot) {
  const { header } = await authenticate(planFile, materializedRoot); const handler = formFor(header.form); if (!handler) fail(`no verify validator for form: ${header.form}`);
  const validation = await handler.validate(header.destination); if (!validation.valid) fail(`destination invalid:\n${validation.errors.join("\n")}`);
  for await (const change of iterateChangeManifest(header.changes.path)) if (await hashFile(change.target) !== change.targetAfter) fail(`destination hash mismatch: ${change.target}`);
  return { valid: true, destination: header.destination, writes: validation.count, warnings: validation.warnings };
}

export async function validateForm(form, root) { const handler = formFor(form); if (!handler) fail(`unknown form: ${form}`); return handler.validate(root); }
export const materializeTerms = materializePlan;
export const applyTerms = applyPlan;
export const verifyTerms = verifyPlan;
export const validateTerms = validateTerm;
