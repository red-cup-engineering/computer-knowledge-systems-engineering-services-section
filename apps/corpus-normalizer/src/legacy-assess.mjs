import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { orderedEntries } from "./inventory.mjs";
import { compareTrees } from "./tree-compare.mjs";
import { scratchDirectory } from "./temp.mjs";

export const legacyAssessmentSchema = "corpus-normalizer.legacy-assessment.v1";
const canonicalName = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = (message) => { throw new Error(message); };

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function familyPath(root, relative) {
  if (relative === undefined) return path.resolve(root);
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) fail("legacy family path must be a non-empty safe relative path");
  const normalized = path.normalize(relative); if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) fail("legacy family path escapes legacy root");
  return path.resolve(root, normalized);
}
async function requireDirectory(root, label) {
  const stat = await lstat(root); if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a regular directory`);
}

async function legacyWitnesses(root, slug, maxWitnesses, chunkSize) {
  try { await requireDirectory(root, "legacy family root"); } catch (error) { if (error.code === "ENOENT") return []; throw error; } const witnesses = [];
  for await (const entry of orderedEntries(root, chunkSize)) {
    const match = canonicalName.exec(entry.name);
    if (!match || !validDate(match[1])) fail(`invalid direct legacy family name: ${entry.name}`);
    const absolutePath = path.join(root, entry.name); const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`legacy family witness must be a regular directory: ${entry.name}`);
    if (match[2] !== slug) continue;
    witnesses.push({ name: entry.name, date: match[1], slug: match[2], path: absolutePath });
    if (witnesses.length > maxWitnesses) fail(`legacy family exceeds maxWitnesses (${maxWitnesses})`);
  }
  return witnesses;
}

function resultBase(candidate, live, legacyRoot, familyRoot, options, liveComparison, maxTotalComparisonRecords) {
  return { schema: legacyAssessmentSchema, candidate: path.resolve(candidate), live: path.resolve(live), legacyRoot: path.resolve(legacyRoot), familyRoot, form: options.form, date: options.date, slug: options.slug, proposedLegacyPath: path.join(familyRoot, `${options.date}-${options.slug}`), liveComparison, legacyComparisons: [], totalComparisonRecords: liveComparison.summary.records, maxTotalComparisonRecords };
}

async function proposedCollision(base) {
  const stat = await lstat(base.proposedLegacyPath).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (!stat) return { state: "absent", path: base.proposedLegacyPath };
  const compared = base.legacyComparisons.find(({ witness }) => witness.path === base.proposedLegacyPath);
  const evidence = { state: compared ? "compared-matching-witness" : "unassessed-collision", path: base.proposedLegacyPath, type: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "other", witness: compared?.witness.name ?? null };
  if (!compared) { const error = new Error(`proposed legacy path collides with an unassessed path: ${base.proposedLegacyPath}`); error.evidence = evidence; throw error; }
  return evidence;
}

/**
 * Read-only compare-first assessment. `allowEmptyLive: true` is required when
 * the live root is absent or contains no authored records.
 */
export async function assessLegacy(candidateRoot, liveRoot, legacyRoot, options = {}) {
  if (!["application", "service-section"].includes(options.form)) fail("legacy assessment form must be application or service-section");
  if (!validDate(options.date)) fail("legacy assessment date must be canonical YYYY-MM-DD");
  if (!safeSlug.test(options.slug ?? "")) fail("legacy assessment slug must be canonical lowercase kebab-case");
  const maxWitnesses = options.maxWitnesses ?? 100; const maxRecords = options.maxRecords ?? 10000; const maxTotalComparisonRecords = options.maxTotalComparisonRecords ?? 100000; const chunkSize = options.chunkSize ?? 128;
  if (!Number.isSafeInteger(maxWitnesses) || maxWitnesses < 1) fail("maxWitnesses must be a positive safe integer");
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) fail("maxRecords must be a positive safe integer");
  if (!Number.isSafeInteger(maxTotalComparisonRecords) || maxTotalComparisonRecords < 1) fail("maxTotalComparisonRecords must be a positive safe integer");
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) fail("chunkSize must be a positive safe integer");
  await requireDirectory(path.resolve(candidateRoot), "candidate root"); await requireDirectory(path.resolve(legacyRoot), "legacy root");
  const familyRoot = familyPath(legacyRoot, options.mirroredRelativeFamilyPath);
  let comparisonLive = path.resolve(liveRoot); let temporaryLive = null;
  try { await requireDirectory(comparisonLive, "live root"); }
  catch (error) { if (!options.allowEmptyLive || error.code !== "ENOENT") throw error; const scratch=await scratchDirectory(options.tempDirectory);await mkdir(scratch,{recursive:true});temporaryLive=await mkdtemp(path.join(scratch,"corpus-normalizer-empty-live-"));comparisonLive=temporaryLive; }
  try {
    const comparisonOptions = { form: options.form, maxRecords, maxChangedTextBytes: options.maxChangedTextBytes };
    const liveComparison = await compareTrees(candidateRoot, comparisonLive, comparisonOptions);
    if (liveComparison.summary.candidateFiles === 0) fail("candidate root has no authored files");
    const liveIsEmpty = liveComparison.summary.liveFiles === 0 && liveComparison.summary.liveDirectories === 0;
    if (liveIsEmpty && options.allowEmptyLive !== true) fail("empty live root requires allowEmptyLive: true");
    const base = resultBase(candidateRoot, liveRoot, legacyRoot, familyRoot, options, liveComparison, maxTotalComparisonRecords);
    if (base.totalComparisonRecords > maxTotalComparisonRecords) fail(`legacy assessment exceeded maxTotalComparisonRecords (${maxTotalComparisonRecords})`);
    const witnesses = await legacyWitnesses(familyRoot, options.slug, maxWitnesses, chunkSize);
    if (["exact-tree", "candidate-covered-subset"].includes(liveComparison.summary.relation)) return { ...base, decision: "covered-by-live", status: "proven", proposedLegacyPath: null };
    if (liveComparison.summary.relation === "additive-no-conflicts") return { ...base, decision: "fuse-into-live", status: "supported", proposedLegacyPath: null };

    for (const witness of witnesses) { const comparison=await compareTrees(candidateRoot,witness.path,comparisonOptions);base.totalComparisonRecords+=comparison.summary.records;if(base.totalComparisonRecords>maxTotalComparisonRecords)fail(`legacy assessment exceeded maxTotalComparisonRecords (${maxTotalComparisonRecords})`);base.legacyComparisons.push({witness,comparison}); }
    const covered = base.legacyComparisons.find(({ comparison }) => ["exact-tree", "candidate-covered-subset"].includes(comparison.summary.relation));
    if (covered) return { ...base, decision: "covered-by-legacy", status: "proven", proposedLegacyPath: null, selectedWitness: covered.witness };
    const replaceable = [...base.legacyComparisons].reverse().find(({ comparison }) => comparison.summary.relation === "additive-no-conflicts");
    base.proposedLegacyCollision=await proposedCollision(base);
    if (replaceable) return { ...base, decision: "replace-covered-legacy-family", status: "review", selectedWitness: replaceable.witness };
    return { ...base, decision: "retain-divergent-review", status: "review" };
  } finally { if (temporaryLive) await rm(temporaryLive, { recursive: true, force: true }); }
}

export function legacyFamilyName(date, slug) {
  if (!validDate(date) || !safeSlug.test(slug ?? "")) fail("invalid canonical legacy date or slug");
  return `${date}-${slug}`;
}
