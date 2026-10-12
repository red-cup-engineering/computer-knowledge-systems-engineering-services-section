import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rmdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyArchiveCarrier } from "./archive-transaction.mjs";
import { verifyBibliography } from "./bibliography-transaction.mjs";
import { verifyPlan } from "./materialize.mjs";
import { authenticateRouteTask, readAuthenticatedRoutePlan } from "./route-task.mjs";

export const routeTaskReceiptSchema = "corpus-normalizer.route-task-receipt.v1";
export const routeArchiveReceiptSchema = "corpus-normalizer.route-archive-receipt.v1";
export const routeCompletionSchema = "corpus-normalizer.route-completion.v1";
const fail = message => { throw new Error(message); };
const taskHash = task => createHash("sha256").update(JSON.stringify(task)).digest("hex");
async function hash(file) { const h = createHash("sha256"); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest("hex"); }
async function missing(file) { try { await lstat(file); return false; } catch (error) { if (error.code === "ENOENT") return true; throw error; } }
function within(root, target) { const relative = path.relative(root, target); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
async function json(file, name) { try { return JSON.parse(await readFile(file, "utf8")); } catch { fail(`${name} is not valid JSON`); } }
async function writeNew(output, value) { const target = path.resolve(output); if (!await missing(target)) fail("receipt output must be absent"); await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${randomUUID()}.tmp`; try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, target); return target; } catch (error) { await rm(temporary, { force: true }); throw error; } }
async function bound(routeFile, taskId) { const route = path.resolve(routeFile), plan = await readAuthenticatedRoutePlan(route), task = authenticateRouteTask(plan, taskId); return { route, plan, task, routeSha256: await hash(route), taskSha256: taskHash(task) }; }
async function requireRetired(plan, task) { for (const relative of task.sourcePaths) { const source = path.resolve(plan.sourceRoot, relative); if (!within(plan.sourceRoot, source) || !await missing(source)) fail(`route task source remains: ${relative}`); } }
async function verifyTaskExecution(item, artifactFile, materializedRoot) {
  const artifact = path.resolve(artifactFile), materialized = path.resolve(materializedRoot); if (await missing(artifact) || await missing(materialized)) fail("route task plan and materialized overlay must exist");
  const bibliography = item.task.form === "bibliography"; const verified = bibliography ? await verifyBibliography(artifact, materialized) : await verifyPlan(artifact, materialized);
  const manifest = bibliography ? `${materialized}.corpus-normalizer-bibliography-run.json` : `${materialized}.corpus-normalizer-run.json`; if (await missing(manifest)) fail("materialized overlay run manifest is absent"); const manifestRecord = await json(manifest, "materialized overlay run manifest");
  const artifacts = [artifact, manifest]; if (bibliography) artifacts.push(path.join(materialized, "bibliography.bib")); else { if (!manifestRecord.changes?.path || !manifestRecord.tree?.path) fail("materialized overlay run manifest is incomplete"); artifacts.push(manifestRecord.changes.path, manifestRecord.tree.path); }
  for (const file of artifacts) if (await missing(file)) fail("materialized overlay artifact is absent"); return { verified, materialized, artifacts: await Promise.all(artifacts.map(async file => ({ path: path.resolve(file), sha256: await hash(file) }))) };
}

export async function receiptRouteTask(routeFile, taskId, artifactFile, materializedRoot, output) {
  const item = await bound(routeFile, taskId); if (item.task.status === "invalid" || item.task.form === "archive-inspect") fail("route task cannot receive an ordinary completion receipt");
  const artifact = path.resolve(artifactFile), execution = await verifyTaskExecution(item, artifact, materializedRoot); await requireRetired(item.plan, item.task);
  return { output: await writeNew(output, { schema: routeTaskReceiptSchema, route: item.route, routeSha256: item.routeSha256, taskId, taskSha256: item.taskSha256, artifact, artifactSha256: await hash(artifact), materialized: execution.materialized, materializedArtifacts: execution.artifacts, sourceRetired: true }), taskId };
}

export async function retireRouteArchive(routeFile, taskId, manifestFile, nestedCompletionFile, output) {
  const item = await bound(routeFile, taskId); if (item.task.form !== "archive-inspect" || item.task.status === "invalid") fail("route task is not a retireable archive carrier");
  const carrier = path.resolve(item.plan.sourceRoot, item.task.sourcePaths[0]); if (await missing(carrier)) fail("archive carrier is already absent"); const manifest = path.resolve(manifestFile), verified = await verifyArchiveCarrier(manifest), nestedCompletion = path.resolve(nestedCompletionFile), nested = await json(nestedCompletion, "nested completion receipt"); if (path.resolve(verified.archive) !== carrier) fail("archive manifest does not bind the routed carrier");
  if (nested.schema !== routeCompletionSchema || nested.complete !== true || nested.sourceRoot !== verified.output) fail("nested completion does not bind the extracted archive tree");
  const receipt = { schema: routeArchiveReceiptSchema, route: item.route, routeSha256: item.routeSha256, taskId, taskSha256: item.taskSha256, archiveManifest: manifest, archiveManifestSha256: await hash(manifest), carrierSha256: await hash(carrier), nestedCompletion, nestedCompletionSha256: await hash(nestedCompletion), extractedRoot: verified.output, carrierRetired: true };
  const target = path.resolve(output); if (!await missing(target)) fail("receipt output must be absent"); await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`); await rename(temporary, target); try { await rm(carrier); } catch (error) { await rm(target, { force: true }); throw error; } return { output: target, taskId, carrier }; } catch (error) { await rm(temporary, { force: true }); throw error; }
}

async function validate(item, file) {
  const receipt = await json(file, "task receipt"); if (receipt.route !== item.route || receipt.routeSha256 !== item.routeSha256 || receipt.taskId !== item.task.id || receipt.taskSha256 !== item.taskSha256) fail(`receipt is not authenticated for route task: ${item.task.id}`);
  if (item.task.form === "archive-inspect") {
    if (receipt.schema !== routeArchiveReceiptSchema || receipt.carrierRetired !== true || typeof receipt.carrierSha256 !== "string" || await missing(receipt.archiveManifest) || await missing(receipt.nestedCompletion)) fail(`archive receipt is incomplete: ${item.task.id}`);
    if (await hash(receipt.archiveManifest) !== receipt.archiveManifestSha256 || await hash(receipt.nestedCompletion) !== receipt.nestedCompletionSha256) fail(`archive receipt artifact drift: ${item.task.id}`);
    const nested = await json(receipt.nestedCompletion, "nested completion receipt"); if (nested.schema !== routeCompletionSchema || nested.complete !== true || nested.sourceRoot !== receipt.extractedRoot) fail(`archive nested completion is invalid: ${item.task.id}`);
  } else {
    if (receipt.schema !== routeTaskReceiptSchema || receipt.sourceRetired !== true || await missing(receipt.artifact) || !Array.isArray(receipt.materializedArtifacts) || await hash(receipt.artifact) !== receipt.artifactSha256) fail(`task receipt artifact drift: ${item.task.id}`);
    for (const witness of receipt.materializedArtifacts) if (!witness || typeof witness.path !== "string" || typeof witness.sha256 !== "string" || await missing(witness.path) || await hash(witness.path) !== witness.sha256) fail(`task receipt materialized artifact drift: ${item.task.id}`);
    await verifyTaskExecution(item, receipt.artifact, receipt.materialized);
  }
  await requireRetired(item.plan, item.task);
}
async function prune(root) { if (await missing(root)) return 0; let count = 0; for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isDirectory()) { const child = path.join(root, entry.name); count += await prune(child); try { await rmdir(child); count += 1; } catch (error) { if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error; } } return count; }

export async function completeRoute(routeFile, receiptFiles, output) {
  const route = path.resolve(routeFile), plan = await readAuthenticatedRoutePlan(route); if (plan.tasks.some(task => task.status === "invalid")) fail("route contains unresolved invalid tasks"); if (!Array.isArray(receiptFiles) || receiptFiles.length !== plan.tasks.length) fail("completion requires exactly one receipt for every route task");
  const receipts = new Map(); for (const file of receiptFiles) { const receipt = await json(file, "task receipt"); if (!receipt.taskId || receipts.has(receipt.taskId)) fail("completion receipts contain duplicate or anonymous task ids"); receipts.set(receipt.taskId, path.resolve(file)); }
  for (const task of plan.tasks) { const file = receipts.get(task.id); if (!file) fail(`completion receipt missing task: ${task.id}`); await validate(await bound(route, task.id), file); }
  const completion = { schema: routeCompletionSchema, route, routeSha256: await hash(route), sourceRoot: plan.sourceRoot, complete: true, taskCount: plan.tasks.length, receipts: [...receipts.values()].sort(), prunedDirectories: await prune(plan.sourceRoot) };
  return { output: await writeNew(output, completion), ...completion };
}
