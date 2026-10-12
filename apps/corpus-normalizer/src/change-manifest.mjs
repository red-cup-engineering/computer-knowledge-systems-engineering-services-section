import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import readline from "node:readline";
import { readPlanLines } from "./plan.mjs";

const changeActions = new Set(["write", "copy", "covered-by-destination", "covered-by-duplicate"]);
const line = (value) => `${JSON.stringify(value)}\n`;

export function changeFromDecision(decision) {
  if (!changeActions.has(decision.proposed?.action)) return null;
  return {
    sourcePath: decision.sourcePath,
    sourceRoot: decision.sourceRoot,
    target: decision.proposed.output,
    sourceHash: decision.proposed.sourceContentSha256,
    targetBefore: decision.target?.state === "exact-covered" ? decision.target.sha256 : null,
    targetAfter: decision.proposed.proposedContentSha256,
    action: decision.proposed.action, modeAfter: decision.proposed.mode ?? null,
    ...(["write", "copy"].includes(decision.proposed.action) ? {} : { covered: true })
  };
}

export async function* deriveChanges(planFile) {
  for await (const decision of readPlanLines(planFile)) {
    const change = changeFromDecision(decision);
    if (change) yield change;
  }
}

export async function createChangeManifestWriter(output) {
  const stream = createWriteStream(output, { encoding: "utf8" }); const hash = createHash("sha256"); let count = 0; let done = false;
  async function write(change) {
    if (done) throw new Error("change manifest writer is closed");
    const record = line(change); hash.update(record);
    if (!stream.write(record)) await new Promise((resolve, reject) => { stream.once("drain", resolve); stream.once("error", reject); });
    count += 1;
  }
  return {
    write,
    async close() { if (done) throw new Error("change manifest writer is closed"); done = true; await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); }); return { path: output, hash: hash.digest("hex"), count }; },
    async abort() { if (!done) { done = true; stream.destroy(); } await rm(output, { force: true }); }
  };
}

export async function writeChangeManifest(planFile, output) {
  const writer = await createChangeManifestWriter(output);
  try { for await (const change of deriveChanges(planFile)) await writer.write(change); return await writer.close(); }
  catch (error) { await writer.abort(); throw error; }
}

export async function* iterateChangeManifest(file) {
  const input = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const record of input) if (record.trim()) yield JSON.parse(record);
}

export async function verifyChangeManifest(planFile, file, expected = {}) {
  const actual = iterateChangeManifest(file)[Symbol.asyncIterator](); const hash = createHash("sha256"); let count = 0;
  try {
    for await (const change of deriveChanges(planFile)) {
      const next = await actual.next();
      if (next.done || JSON.stringify(next.value) !== JSON.stringify(change)) return { valid: false, count };
      hash.update(line(next.value)); count += 1;
    }
    if (!(await actual.next()).done) return { valid: false, count };
    const result = { valid: true, hash: hash.digest("hex"), count };
    if ((expected.hash && expected.hash !== result.hash) || (expected.count !== undefined && expected.count !== result.count)) return { valid: false, count };
    return result;
  } finally { await actual.return?.(); }
}
