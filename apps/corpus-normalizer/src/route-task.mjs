import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectArchive } from "./archive.mjs";
import { writeBibliographyPlan } from "./bibliography-transaction.mjs";
import { readPlanLines, writePlan } from "./plan.mjs";
import { routerSchemaVersion, validateRouteRecords } from "./router.mjs";

const allowedGeneric = new Set(["term", "triage-text", "note", "reference-source", "application", "service-section"]);
const codeUnitSorted = values => values.every((value, index) => index === 0 || values[index - 1] < value);
const fail = message => { throw new Error(message); };

export async function readAuthenticatedRoutePlan(file) {
  const records = []; for await (const record of readPlanLines(file)) records.push(record);
  const validation = validateRouteRecords(records); if (!validation.valid) fail(`invalid route plan: ${validation.errors.join("; ")}`);
  const header = records[0];
  if (header.schema !== routerSchemaVersion || header.kind !== "header") fail("not a route plan");
  const summary = records.find(record => record.kind === "summary");
  if (summary) {
    if (records.at(-1) !== summary || records.filter(record => record.kind === "summary").length !== 1) fail("route summary must be unique and final");
    const tasks = records.filter(record => record.kind === "task"); const accountingCount = records.filter(record => record.kind === "accounting").length; const byForm = {}; const byStatus = {}; const unresolvedInvalidTasks = [];
    for (const record of tasks) { byForm[record.form] = (byForm[record.form] ?? 0) + 1; byStatus[record.status] = (byStatus[record.status] ?? 0) + 1; if (record.status === "invalid") unresolvedInvalidTasks.push({ id: record.id, form: record.form, sourcePaths: record.sourcePaths, reason: record.reason, preconditions: record.preconditions }); }
    const ordered = value => Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)); const expected = { schema: routerSchemaVersion, kind: "summary", taskCount: tasks.length, accountingCount, byForm: ordered(byForm), byStatus: ordered(byStatus), unresolvedInvalidTasks };
    if (JSON.stringify(summary) !== JSON.stringify(expected)) fail("route summary does not match its records");
  }
  const sourceRoot = path.resolve(header.sourceRoot); const destination = path.resolve(header.destination);
  const tasks = records.filter(record => record.kind === "task"); const accounting = new Map();
  for (const record of records.filter(record => record.kind === "accounting")) {
    if (typeof record.path !== "string" || accounting.has(record.path)) fail("route accounting is incomplete or duplicate");
    const expected = path.resolve(sourceRoot, record.path);
    if (record.sourcePath !== expected || (expected !== sourceRoot && !expected.startsWith(`${sourceRoot}${path.sep}`))) fail(`unsafe route accounting path: ${record.path}`);
    accounting.set(record.path, record);
  }
  return { sourceRoot, destination, tasks, accounting };
}
export function authenticateRouteTask(plan, taskId) {
  const selected = plan.tasks.filter(task => task.id === taskId);
  if (selected.length !== 1) fail(selected.length ? `duplicate route task id: ${taskId}` : `unknown route task id: ${taskId}`);
  const task = selected[0];
  if (!Array.isArray(task.sourcePaths) || !task.sourcePaths.length || !codeUnitSorted(task.sourcePaths) || new Set(task.sourcePaths).size !== task.sourcePaths.length) fail("route task sourcePaths are not unique code-unit sorted paths");
  for (const relative of task.sourcePaths) {
    const record = plan.accounting.get(relative); const absolute = path.resolve(plan.sourceRoot, relative);
    if (!record || !record.membership || record.membership.taskId !== task.id || (absolute !== plan.sourceRoot && !absolute.startsWith(`${plan.sourceRoot}${path.sep}`))) fail(`route task source is not authenticated by accounting: ${relative}`);
  }
  return task;
}
async function requireNewOutput(output, sourceRoot) {
  const resolved = path.resolve(output);
  if (resolved === sourceRoot || resolved.startsWith(`${sourceRoot}${path.sep}`)) fail("route task output must be outside the source root");
  try { await lstat(resolved); fail("route task output must be absent"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(path.dirname(resolved), { recursive: true }); return resolved;
}

/** Prepare exactly one routed unit.  This only writes a dry-run artifact. */
export async function prepareRouteTask(routePlanFile, taskId, output, options = {}) {
  const plan = await readAuthenticatedRoutePlan(routePlanFile); const task = authenticateRouteTask(plan, taskId); const artifact = await requireNewOutput(output, plan.sourceRoot);
  if (task.form === "invalid") fail(`invalid route task cannot be prepared: ${task.reason}`);
  try {
    if (allowedGeneric.has(task.form)) {
      if (task.sourcePaths.length !== 1) fail(`${task.form} route task requires exactly one source path`);
      const source = path.resolve(plan.sourceRoot, task.sourcePaths[0]);
      return { taskId, form: task.form, ...(await writePlan(source, task.destination, artifact, options)) };
    }
    if (task.form === "bibliography") return { taskId, form: task.form, ...(await writeBibliographyPlan(plan.sourceRoot, task.destination, artifact, { ...options, sourcePaths: task.sourcePaths })) };
    if (task.form === "archive-inspect") {
      if (task.sourcePaths.length !== 1) fail("archive route task requires exactly one source path");
      const archive = path.resolve(plan.sourceRoot, task.sourcePaths[0]); const inventory = await inspectArchive(archive, options);
      const temporary = `${artifact}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, `${JSON.stringify({ schema: "corpus-normalizer.archive-inventory.v1", taskId, sourceRoot: plan.sourceRoot, source: task.sourcePaths[0], ...inventory })}\n`, "utf8"); await rename(temporary, artifact); } catch (error) { await rm(temporary, { force: true }); throw error; }
      return { taskId, form: task.form, output: artifact, members: inventory.members.length };
    }
    fail(`unsupported route task form: ${task.form}`);
  } catch (error) { await rm(artifact, { force: true }); throw error; }
}
