#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { explainPlan, readPlanLines, writePlan } from "../src/plan.mjs";
import { applyPlan, materializePlan, validateForm, verifyPlan } from "../src/materialize.mjs";
import { resolveDestinationContract } from "../src/contracts.mjs";
import { applyBibliography, explainBibliographyPlan, materializeBibliography, validateBibliography, verifyBibliography, writeBibliographyPlan } from "../src/bibliography-transaction.mjs";
import { analyzeSimilarity } from "../src/similarity.mjs";
import { unpackArchive, verifyArchive, writeArchiveInventory } from "../src/archive-transaction.mjs";
import { streamTreeComparison } from "../src/tree-compare.mjs";
import { assessLegacy } from "../src/legacy-assess.mjs";
import { routePlan, routerSchemaVersion } from "../src/router.mjs";
import { prepareRouteTask } from "../src/route-task.mjs";
import { completeRoute, receiptRouteTask, retireRouteArchive } from "../src/route-completion.mjs";
import { createInterface } from "node:readline";

function usage() {
  return `Usage:
  corpus-normalizer plan SOURCE DESTINATION --output PLAN.ndjson [--rewrite-map JSON]
  corpus-normalizer explain PLAN.ndjson
  corpus-normalizer materialize --plan PLAN.ndjson --output TEMP_ROOT
  corpus-normalizer validate --form term|triage-text|note|reference-source|application|service-section|bibliography --root ROOT
  corpus-normalizer apply --plan PLAN.ndjson --materialized TEMP_ROOT
  corpus-normalizer verify --plan PLAN.ndjson --materialized TEMP_ROOT
  corpus-normalizer route SOURCE DESTINATION --output ROUTE.ndjson [--max-records INTEGER] [--max-tasks INTEGER] [--chunk-size INTEGER]
  corpus-normalizer explain-route ROUTE.ndjson
  corpus-normalizer prepare-task ROUTE.ndjson TASK_ID --output ARTIFACT
  corpus-normalizer receipt-task ROUTE.ndjson TASK_ID --artifact PLAN.ndjson --materialized OVERLAY --output RECEIPT.json
  corpus-normalizer retire-archive ROUTE.ndjson TASK_ID --manifest MANIFEST --nested-completion COMPLETION.json --output RECEIPT.json
  corpus-normalizer complete-route ROUTE.ndjson --receipt RECEIPT.json [--receipt RECEIPT.json ...] --output COMPLETION.json
  corpus-normalizer analyze-similarity INPUT.ndjson --root ROOT --output EVIDENCE.ndjson [--threshold NUMBER] [--max-bucket INTEGER] [--max-candidates INTEGER] [--max-body-bytes INTEGER] [--token-cache INTEGER] [--trust-source-hash] [--temp-dir PATH]
  corpus-normalizer inspect-archive ARCHIVE --output INVENTORY.ndjson [ARCHIVE LIMIT OPTIONS]
  corpus-normalizer unpack-archive ARCHIVE --output TEMP_ROOT [--strip-wrapper] [ARCHIVE LIMIT OPTIONS]
  corpus-normalizer verify-archive --manifest MANIFEST
  corpus-normalizer compare-trees CANDIDATE LIVE --form application|service-section --output COMPARISON.ndjson [--max-records INTEGER] [--max-changed-text-bytes INTEGER] [--include-generated]
  corpus-normalizer assess-legacy CANDIDATE LIVE LEGACY --form application|service-section --date YYYY-MM-DD --slug SLUG --output ASSESSMENT.json [--family-path PATH] [--allow-empty-live] [BOUNDS] [--temp-dir PATH]`;
}

async function bibliographyPlan(file) {
  for await (const record of readPlanLines(file)) return record.type === "header" && record.schema === "corpus-normalizer.bibliography-plan.v1";
  return false;
}

function similarityArguments(args) {
  if (!args[0] || args[0].startsWith("--")) throw new Error(usage());
  const result = { input: args[0], options: {} }; const seen = new Set();
  const values = new Map([["--output", "output"], ["--root", "root"], ["--threshold", "threshold"], ["--max-bucket", "maxBucket"], ["--max-candidates", "maxCandidates"], ["--max-body-bytes", "maxBodyBytes"], ["--token-cache", "tokenCacheLimit"], ["--temp-dir", "tempDirectory"]]);
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index]; if (seen.has(flag)) throw new Error(`duplicate similarity option: ${flag}`); seen.add(flag);
    if (flag === "--trust-source-hash") { result.options.trustSourceHash = true; continue; }
    const key = values.get(flag); if (!key) throw new Error(`unknown similarity option: ${flag}\n${usage()}`);
    const value = args[++index]; if (!value || value.startsWith("--")) throw new Error(`similarity option requires a value: ${flag}`);
    if (key === "output") result.output = value;
    else if (key === "root") result.options.root = value;
    else if (key === "tempDirectory") result.options.tempDirectory = value;
    else if (key === "threshold") { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error("--threshold must be a number from 0 through 1"); result.options[key] = number; }
    else { if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer`); const number = Number(value); const minimum = key === "maxBucket" ? 2 : 1; if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${flag} must be a safe integer of at least ${minimum}`); result.options[key] = number; }
  }
  if (!result.output || !result.options.root) throw new Error(usage());
  return result;
}

async function writeSimilarity(input, output, options) {
  const outputPath = path.resolve(output); if (path.resolve(input) === outputPath) throw new Error("similarity output must differ from input");
  const evidence = await analyzeSimilarity(input, options); await mkdir(path.dirname(outputPath), { recursive: true }); const stream = createWriteStream(outputPath, { encoding: "utf8" });
  try { for (const record of evidence) if (!stream.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve, reject) => { stream.once("drain", resolve); stream.once("error", reject); }); await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); }); return { output: outputPath, count: evidence.length }; }
  catch (error) { stream.destroy(); await rm(outputPath, { force: true }); throw error; }
}

function archiveArguments(args, { strip = false } = {}) {
  if (!args[0] || args[0].startsWith("--")) throw new Error(usage());
  const result = { archive: args[0], options: {} }; const seen = new Set();
  const values = new Map([["--output", "output"], ["--max-members", "maxMembers"], ["--max-expanded-bytes", "maxExpandedBytes"], ["--max-member-bytes", "maxMemberBytes"], ["--max-path-length", "maxPathLength"], ["--max-nesting", "maxNesting"], ["--high-water-mark", "highWaterMark"]]);
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index]; if (seen.has(flag)) throw new Error(`duplicate archive option: ${flag}`); seen.add(flag);
    if (flag === "--strip-wrapper") { if (!strip) throw new Error(`unknown archive option: ${flag}`); result.options.stripWrapper = true; continue; }
    const key = values.get(flag); if (!key) throw new Error(`unknown archive option: ${flag}\n${usage()}`);
    const value = args[++index]; if (!value || value.startsWith("--")) throw new Error(`archive option requires a value: ${flag}`);
    if (key === "output") result.output = value;
    else { if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer`); const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${flag} must be a positive safe integer`); result.options[key] = number; }
  }
  if (!result.output) throw new Error(usage()); return result;
}

function archiveManifestArgument(args) {
  if (args.length !== 2 || args[0] !== "--manifest" || !args[1] || args[1].startsWith("--")) throw new Error(usage());
  return args[1];
}

function treeComparisonArguments(args) {
  if (!args[0] || !args[1] || args[0].startsWith("--") || args[1].startsWith("--")) throw new Error(usage());
  const result = { candidate: args[0], live: args[1], options: {} }; const seen = new Set(); const values = new Map([["--form", "form"], ["--output", "output"], ["--max-records", "maxRecords"], ["--max-changed-text-bytes", "maxChangedTextBytes"]]);
  for (let index = 2; index < args.length; index += 1) {
    const flag = args[index]; if (seen.has(flag)) throw new Error(`duplicate tree comparison option: ${flag}`); seen.add(flag);
    if (flag === "--include-generated") { result.options.includeGenerated = true; continue; }
    const key = values.get(flag); if (!key) throw new Error(`unknown tree comparison option: ${flag}\n${usage()}`);
    const value = args[++index]; if (!value || value.startsWith("--")) throw new Error(`tree comparison option requires a value: ${flag}`);
    if (key === "form") { if (!["application", "service-section"].includes(value)) throw new Error("--form must be application or service-section"); result.options.form = value; }
    else if (key === "output") result.output = value;
    else { if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer`); const number = Number(value); const minimum = key === "maxChangedTextBytes" ? 0 : 1; if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${flag} must be a safe integer of at least ${minimum}`); result.options[key] = number; }
  }
  if (!result.output || !result.options.form) throw new Error(usage()); return result;
}

function within(root, target) { const relative = path.relative(path.resolve(root), path.resolve(target)); return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)); }
async function writeTreeComparison(candidate, live, output, options) {
  const outputPath = path.resolve(output); if (within(candidate, outputPath) || within(live, outputPath)) throw new Error("tree comparison output must be outside both compared trees");
  if (await lstat(outputPath).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))) throw new Error("tree comparison output must be absent");
  await mkdir(path.dirname(outputPath), { recursive: true }); const temporary = `${outputPath}.${randomUUID()}.tmp`; const stream = createWriteStream(temporary, { encoding: "utf8" }); let summary;
  try {
    for await (const record of streamTreeComparison(candidate, live, options)) { if (record.type === "summary") summary = record; if (!stream.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve, reject) => { stream.once("drain", resolve); stream.once("error", reject); }); }
    await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); }); await rename(temporary, outputPath); return { output: outputPath, summary };
  } catch (error) { stream.destroy(); await rm(temporary, { force: true }); throw error; }
}

function legacyAssessmentArguments(args) {
  if (!args[0] || !args[1] || !args[2] || args.slice(0,3).some((value)=>value.startsWith("--"))) throw new Error(usage());
  const result={candidate:args[0],live:args[1],legacy:args[2],options:{}};const seen=new Set();const values=new Map([["--form","form"],["--date","date"],["--slug","slug"],["--output","output"],["--family-path","mirroredRelativeFamilyPath"],["--max-witnesses","maxWitnesses"],["--max-records","maxRecords"],["--max-total-comparison-records","maxTotalComparisonRecords"],["--max-changed-text-bytes","maxChangedTextBytes"],["--chunk-size","chunkSize"],["--temp-dir","tempDirectory"]]);
  for(let index=3;index<args.length;index+=1){const flag=args[index];if(seen.has(flag))throw new Error(`duplicate legacy assessment option: ${flag}`);seen.add(flag);if(flag==="--allow-empty-live"){result.options.allowEmptyLive=true;continue;}const key=values.get(flag);if(!key)throw new Error(`unknown legacy assessment option: ${flag}\n${usage()}`);const value=args[++index];if(!value||value.startsWith("--"))throw new Error(`legacy assessment option requires a value: ${flag}`);if(key==="output")result.output=value;else if(["form","date","slug","mirroredRelativeFamilyPath","tempDirectory"].includes(key))result.options[key]=value;else{if(!/^\d+$/.test(value))throw new Error(`${flag} must be an integer`);const number=Number(value),minimum=key==="maxChangedTextBytes"?0:1;if(!Number.isSafeInteger(number)||number<minimum)throw new Error(`${flag} must be a safe integer of at least ${minimum}`);result.options[key]=number;}}
  if(!result.output||!result.options.form||!result.options.date||!result.options.slug)throw new Error(usage());if(!["application","service-section"].includes(result.options.form))throw new Error("--form must be application or service-section");return result;
}

async function writeLegacyAssessment(candidate,live,legacy,output,options){const outputPath=path.resolve(output);if([candidate,live,legacy].some((root)=>within(root,outputPath)))throw new Error("legacy assessment output must be outside candidate, live, and legacy roots");if(await lstat(outputPath).catch((error)=>error.code==="ENOENT"?null:Promise.reject(error)))throw new Error("legacy assessment output must be absent");const assessment=await assessLegacy(candidate,live,legacy,options);await mkdir(path.dirname(outputPath),{recursive:true});const temporary=`${outputPath}.${randomUUID()}.tmp`;try{await writeFile(temporary,`${JSON.stringify(assessment,null,2)}\n`,"utf8");await rename(temporary,outputPath);return{output:outputPath,decision:assessment.decision,status:assessment.status,totalComparisonRecords:assessment.totalComparisonRecords};}catch(error){await rm(temporary,{force:true});throw error;}}

function routeArguments(args) {
  if (args.length < 4 || !args[0] || !args[1] || args[0].startsWith("--") || args[1].startsWith("--")) throw new Error(usage());
  const result = { source: args[0], destination: args[1], options: {} }; const seen = new Set();
  const values = new Map([["--output", "output"], ["--max-records", "maxRecords"], ["--max-tasks", "maxTasks"], ["--chunk-size", "chunkSize"]]);
  for (let index = 2; index < args.length; index += 1) {
    const flag = args[index]; if (seen.has(flag)) throw new Error(`duplicate route option: ${flag}`); seen.add(flag);
    const key = values.get(flag); if (!key) throw new Error(`unknown route option: ${flag}\n${usage()}`);
    const value = args[++index]; if (!value || value.startsWith("--")) throw new Error(`route option requires a value: ${flag}`);
    if (key === "output") result.output = value;
    else { if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer`); const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${flag} must be a positive safe integer`); result.options[key] = number; }
  }
  if (!result.output) throw new Error(usage()); return result;
}

function routeSummaryState() { return { taskCount: 0, accountingCount: 0, forms: new Map(), statuses: new Map(), unresolvedInvalidTasks: [] }; }
function accountRouteRecord(state, record) {
  if (record.kind === "task") {
    state.taskCount += 1; state.forms.set(record.form, (state.forms.get(record.form) ?? 0) + 1); state.statuses.set(record.status, (state.statuses.get(record.status) ?? 0) + 1);
    if (record.status === "invalid") state.unresolvedInvalidTasks.push({ id: record.id, form: record.form, sourcePaths: record.sourcePaths, reason: record.reason, preconditions: record.preconditions });
  } else if (record.kind === "accounting") state.accountingCount += 1;
  else throw new Error(`invalid router record kind: ${record.kind}`);
}
function finalRouteSummary(state) {
  const ordered = map => Object.fromEntries([...map].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  return { schema: routerSchemaVersion, kind: "summary", taskCount: state.taskCount, accountingCount: state.accountingCount, byForm: ordered(state.forms), byStatus: ordered(state.statuses), unresolvedInvalidTasks: state.unresolvedInvalidTasks };
}
async function writeLine(stream, record) {
  if (stream.write(`${JSON.stringify(record)}\n`)) return;
  await new Promise((resolve, reject) => { stream.once("drain", resolve); stream.once("error", reject); });
}
async function writeRoute(source, destination, output, options) {
  const outputPath = path.resolve(output); if (within(source, outputPath) || within(destination, outputPath)) throw new Error("route output must be outside source and destination roots");
  if (await lstat(outputPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error))) throw new Error("route output must be absent");
  await mkdir(path.dirname(outputPath), { recursive: true }); const temporary = `${outputPath}.${randomUUID()}.tmp`; const stream = createWriteStream(temporary, { encoding: "utf8" }); const state = routeSummaryState(); let header; let index = 0;
  try {
    for await (const record of routePlan(source, destination, options)) {
      if (index === 0) { if (record.kind !== "header" || record.schema !== routerSchemaVersion) throw new Error("router plan must begin with an authenticated header"); header = record; }
      else { if (record.schema !== routerSchemaVersion || record.kind === "header" || record.kind === "summary") throw new Error("router plan contains an invalid record"); accountRouteRecord(state, record); }
      await writeLine(stream, record); index += 1;
    }
    if (!header || path.resolve(header.sourceRoot) !== path.resolve(source) || path.resolve(header.destination) !== path.resolve(destination)) throw new Error("router header does not bind the requested roots");
    const summary = finalRouteSummary(state); await writeLine(stream, summary); await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); }); await rename(temporary, outputPath);
    return { output: outputPath, ...summary };
  } catch (error) { stream.destroy(); await rm(temporary, { force: true }); throw error; }
}

async function explainRoute(file) {
  const input = createReadStream(file, { encoding: "utf8" }); const lines = createInterface({ input, crlfDelay: Infinity }); const state = routeSummaryState(); let header; let storedSummary; let index = 0;
  try {
    for await (const line of lines) {
      if (!line.trim()) continue; let record; try { record = JSON.parse(line); } catch { throw new Error(`invalid route JSON at record ${index + 1}`); }
      if (record.schema !== routerSchemaVersion) throw new Error(`invalid router schema at record ${index + 1}`);
      if (index === 0) { if (record.kind !== "header" || typeof record.sourceRoot !== "string" || typeof record.destination !== "string" || !record.options || typeof record.options !== "object") throw new Error("route must begin with a bound header"); header = record; }
      else if (record.kind === "summary") { if (storedSummary) throw new Error("route has multiple summaries"); storedSummary = record; }
      else { if (storedSummary) throw new Error("route summary must be the final record"); accountRouteRecord(state, record); }
      index += 1;
    }
  } finally { lines.close(); input.destroy(); }
  if (!header || !storedSummary) throw new Error("route requires a header and final summary"); const derived = finalRouteSummary(state);
  if (JSON.stringify(storedSummary) !== JSON.stringify(derived)) throw new Error("route summary does not match its records");
  return { header, summary: derived };
}

function prepareTaskArguments(args) {
  if (args.length !== 4 || !args[0] || !args[1] || args[0].startsWith("--") || args[1].startsWith("--") || args[2] !== "--output" || !args[3] || args[3].startsWith("--")) throw new Error(usage());
  return { route: args[0], taskId: args[1], output: args[3] };
}
function receiptTaskArguments(args) { if (args.length !== 8 || !args[0] || !args[1] || args[2] !== "--artifact" || !args[3] || args[4] !== "--materialized" || !args[5] || args[6] !== "--output" || !args[7]) throw new Error(usage()); return { route: args[0], taskId: args[1], artifact: args[3], materialized: args[5], output: args[7] }; }
function retireArchiveArguments(args) { if (args.length !== 8 || !args[0] || !args[1] || args[2] !== "--manifest" || !args[3] || args[4] !== "--nested-completion" || !args[5] || args[6] !== "--output" || !args[7]) throw new Error(usage()); return { route: args[0], taskId: args[1], manifest: args[3], nestedCompletion: args[5], output: args[7] }; }
function completeRouteArguments(args) { if (!args[0] || args[0].startsWith("--")) throw new Error(usage()); const result = { route: args[0], receipts: [] }; for (let index = 1; index < args.length; index += 2) { const flag = args[index], value = args[index + 1]; if (!value || value.startsWith("--")) throw new Error(usage()); if (flag === "--receipt") result.receipts.push(value); else if (flag === "--output" && !result.output) result.output = value; else throw new Error(usage()); } if (!result.output || !result.receipts.length) throw new Error(usage()); return result; }
async function firstJsonRecord(file) {
  const input = createReadStream(file, { encoding: "utf8" }); const lines = createInterface({ input, crlfDelay: Infinity });
  try { for await (const line of lines) if (line.trim()) { try { return JSON.parse(line); } catch { throw new Error("prepared route artifact is not valid NDJSON"); } } }
  finally { lines.close(); input.destroy(); }
  throw new Error("prepared route artifact is empty");
}
async function prepareTaskArtifact(route, taskId, output) {
  let artifactPath;
  try {
    const result = await prepareRouteTask(route, taskId, output); artifactPath = path.resolve(result.output); const first = await firstJsonRecord(artifactPath);
    if (typeof first.schema !== "string") throw new Error("prepared route artifact has no schema");
    const kind = result.form === "archive-inspect" ? "archive-inventory" : result.form === "bibliography" ? "bibliography-plan" : "normalization-plan";
    const nextCommands = kind === "archive-inventory"
      ? ["review the archive inventory; unpacking remains a separate explicit command"]
      : [`corpus-normalizer explain ${artifactPath}`, `corpus-normalizer materialize --plan ${artifactPath} --output TEMP_ROOT`];
    return { taskId: result.taskId, form: result.form, artifact: { kind, path: artifactPath, schema: first.schema }, nextCommands };
  } catch (error) { if (artifactPath) await rm(artifactPath, { force: true }); throw error; }
}

const [command, ...args] = process.argv.slice(2);
if (command === "plan") {
  const outputIndex = args.indexOf("--output");
  const source = args[0];
  const destination = args[1];
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null; const rewriteIndex = args.indexOf("--rewrite-map"); let rewriteMap;
  if (!source || !destination || !output) throw new Error(usage());
  if (rewriteIndex >= 0) { try { rewriteMap = JSON.parse(args[rewriteIndex + 1]); } catch { throw new Error("--rewrite-map must be JSON"); } }
  const result = resolveDestinationContract(destination).form === "bibliography"
    ? await writeBibliographyPlan(source, destination, output)
    : await writePlan(source, destination, output, { rewriteMap });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "explain") {
  if (args.length !== 1) throw new Error(usage());
  if (await bibliographyPlan(args[0])) await explainBibliographyPlan(args[0]); else await explainPlan(args[0]);
} else if (command === "materialize") {
  const planIndex = args.indexOf("--plan"); const outputIndex = args.indexOf("--output");
  if (planIndex < 0 || outputIndex < 0 || !args[planIndex + 1] || !args[outputIndex + 1]) throw new Error(usage());
  const planFile = args[planIndex + 1]; const output = args[outputIndex + 1];
  process.stdout.write(`${JSON.stringify(await (await bibliographyPlan(planFile) ? materializeBibliography(planFile, output) : materializePlan(planFile, output)))}\n`);
} else if (command === "validate") {
  const formIndex = args.indexOf("--form"); const rootIndex = args.indexOf("--root");
  if (formIndex < 0 || rootIndex < 0 || !["term", "triage-text", "note", "reference-source", "application", "service-section", "bibliography"].includes(args[formIndex + 1]) || !args[rootIndex + 1]) throw new Error(usage());
  const form = args[formIndex + 1]; const result = form === "bibliography" ? await validateBibliography(args[rootIndex + 1]) : await validateForm(form, args[rootIndex + 1]); process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.valid) process.exitCode = 1;
} else if (command === "apply" || command === "verify") {
  const planIndex = args.indexOf("--plan"); const materializedIndex = args.indexOf("--materialized");
  if (planIndex < 0 || materializedIndex < 0 || !args[planIndex + 1] || !args[materializedIndex + 1]) throw new Error(usage());
  const planFile = args[planIndex + 1]; const materialized = args[materializedIndex + 1]; const bibliography = await bibliographyPlan(planFile);
  const result = command === "apply" ? (bibliography ? await applyBibliography(planFile, materialized) : await applyPlan(planFile, materialized)) : (bibliography ? await verifyBibliography(planFile, materialized) : await verifyPlan(planFile, materialized));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "analyze-similarity") {
  const parsed = similarityArguments(args); process.stdout.write(`${JSON.stringify(await writeSimilarity(parsed.input, parsed.output, parsed.options))}\n`);
} else if (command === "inspect-archive") {
  const parsed = archiveArguments(args); process.stdout.write(`${JSON.stringify(await writeArchiveInventory(parsed.archive, parsed.output, parsed.options))}\n`);
} else if (command === "unpack-archive") {
  const parsed = archiveArguments(args, { strip: true }); process.stdout.write(`${JSON.stringify(await unpackArchive(parsed.archive, parsed.output, parsed.options))}\n`);
} else if (command === "verify-archive") {
  process.stdout.write(`${JSON.stringify(await verifyArchive(archiveManifestArgument(args)))}\n`);
} else if (command === "compare-trees") {
  const parsed = treeComparisonArguments(args); process.stdout.write(`${JSON.stringify(await writeTreeComparison(parsed.candidate, parsed.live, parsed.output, parsed.options))}\n`);
} else if(command==="assess-legacy"){
  const parsed=legacyAssessmentArguments(args);process.stdout.write(`${JSON.stringify(await writeLegacyAssessment(parsed.candidate,parsed.live,parsed.legacy,parsed.output,parsed.options))}\n`);
} else if (command === "route") {
  const parsed = routeArguments(args); process.stdout.write(`${JSON.stringify(await writeRoute(parsed.source, parsed.destination, parsed.output, parsed.options))}\n`);
} else if (command === "explain-route") {
  if (args.length !== 1) throw new Error(usage()); process.stdout.write(`${JSON.stringify(await explainRoute(args[0]))}\n`);
} else if (command === "prepare-task") {
  const parsed = prepareTaskArguments(args); process.stdout.write(`${JSON.stringify(await prepareTaskArtifact(parsed.route, parsed.taskId, parsed.output))}\n`);
} else if (command === "receipt-task") {
  const parsed = receiptTaskArguments(args); process.stdout.write(`${JSON.stringify(await receiptRouteTask(parsed.route, parsed.taskId, parsed.artifact, parsed.materialized, parsed.output))}\n`);
} else if (command === "retire-archive") {
  const parsed = retireArchiveArguments(args); process.stdout.write(`${JSON.stringify(await retireRouteArchive(parsed.route, parsed.taskId, parsed.manifest, parsed.nestedCompletion, parsed.output))}\n`);
} else if (command === "complete-route") {
  const parsed = completeRouteArguments(args); process.stdout.write(`${JSON.stringify(await completeRoute(parsed.route, parsed.receipts, parsed.output))}\n`);
} else {
  throw new Error(usage());
}
