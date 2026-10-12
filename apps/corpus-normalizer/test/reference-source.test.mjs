import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { resolveDestinationContract } from "../src/contracts.mjs";
import { applyPlan, materializePlan, validateForm, verifyPlan } from "../src/materialize.mjs";
import { plan, writePlan } from "../src/plan.mjs";
import { canonicalReferenceSourceFilename, maxReferenceSourceTextBytes, validateReferenceSource } from "../src/reference-source.mjs";

const destinationFor = (root) => path.join(root, "destination", "content", "text", "documents", "articles", "bibliographies", "sources");
async function collect(source, destination) { const values = []; for await (const item of plan(source, destination)) values.push(item); return values; }

test("reference source contract is the exact canonical bibliography source suffix", () => {
  const accepted = resolveDestinationContract("/corpus/content/text/documents/articles/bibliographies/sources");
  assert.deepEqual(accepted, { form: "reference-source", rule: "destination.reference-sources.v1", destination: "/corpus/content/text/documents/articles/bibliographies/sources" });
  assert.equal(resolveDestinationContract("/corpus/bibliographies/sources").form, "unknown");
  assert.equal(canonicalReferenceSourceFilename("O’Connor_Study.RIS"), "o-connor-study.ris");
  assert.equal(canonicalReferenceSourceFilename("日本語.pdf"), "");
});

test("reference source streams multi-megabyte opaque digests and bounds text before reading", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-bounds-"); const source = path.join(root, "source"); const destination = destinationFor(root); await mkdir(source);
  const opaque = Buffer.alloc(4 * 1024 * 1024, 0xa5); await writeFile(path.join(source, "Large Scan.epub"), opaque);
  await writeFile(path.join(source, "too-large.txt"), Buffer.alloc(maxReferenceSourceTextBytes + 1, 0x61));
  const decisions = await collect(source, destination); const epub = decisions.find((item) => item.input === "Large Scan.epub"); const text = decisions.find((item) => item.input === "too-large.txt");
  assert.equal(epub.proposed.action, "copy"); assert.equal(epub.proposed.sourceContentSha256, createHash("sha256").update(opaque).digest("hex")); assert.equal(text.status, "invalid"); assert.match(text.evidence.join(" "), /byte limit/);
  const validation = await validateReferenceSource(source); assert.ok(validation.errors.some((item) => item.includes("byte limit: too-large.txt")));
});

test("reference source rejects NUL-bearing and invalid UTF-8 text", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-text-safety-"); const source = path.join(root, "source"); const destination = destinationFor(root); await mkdir(source);
  await writeFile(path.join(source, "nul.txt"), Buffer.from([0x61, 0, 0x62])); await writeFile(path.join(source, "invalid.txt"), Buffer.from([0xff]));
  const decisions = await collect(source, destination); assert.equal(decisions.find((item) => item.input === "nul.txt").status, "invalid"); assert.equal(decisions.find((item) => item.input === "invalid.txt").status, "invalid");
  const validation = await validateReferenceSource(source); assert.ok(validation.errors.some((item) => item.includes("NUL"))); assert.ok(validation.errors.some((item) => item.includes("strict UTF-8")));
});

test("reference source planning canonicalizes strict UTF-8 text and copies opaque PDF bytes with mode", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-plan-"); const source = path.join(root, "source"); const destination = destinationFor(root); await mkdir(source);
  await writeFile(path.join(source, "A Study!.md"), "one\r\ntwo\r"); const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 255, 10]); await writeFile(path.join(source, "Field Report.PDF"), pdf); await chmod(path.join(source, "Field Report.PDF"), 0o640);
  const decisions = await collect(source, destination); const text = decisions.find((item) => item.input === "A Study!.md"); const binary = decisions.find((item) => item.input === "Field Report.PDF");
  assert.equal(text.proposed.action, "write"); assert.equal(text.proposed.output, path.join(destination, "a-study.md")); assert.equal(text.proposed.content, "one\ntwo\n");
  assert.equal(binary.proposed.action, "copy"); assert.equal(binary.proposed.output, path.join(destination, "field-report.pdf")); assert.deepEqual(await readFile(binary.sourcePath), pdf); assert.equal(binary.proposed.mode, 0o640);
});

test("reference source collisions are exact-covered only when the canonical output agrees", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-collision-"); const source = path.join(root, "source"); const destination = destinationFor(root); await mkdir(source); await mkdir(destination, { recursive: true });
  await writeFile(path.join(source, "Same Title.md"), "same\n"); await writeFile(path.join(destination, "same-title.md"), "same\n");
  let decisions = await collect(source, destination); assert.equal(decisions.find((item) => item.input === "Same Title.md").proposed.action, "covered-by-destination");
  await writeFile(path.join(source, "same-title.md"), "different\n"); decisions = await collect(source, destination); assert.equal(decisions.find((item) => item.input === "same-title.md").status, "invalid"); assert.ok(decisions.some((item) => item.decision === "identity-conflict"));
});

test("reference source rejects nested, generated, package, executable, empty, unsupported, and linked inputs", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-invalid-"); const source = path.join(root, "source"); const destination = destinationFor(root); await mkdir(path.join(source, "nested"), { recursive: true }); await mkdir(path.join(source, "dist"));
  await writeFile(path.join(source, "nested", "inside.md"), "inside\n"); await writeFile(path.join(source, "dist", "output.md"), "generated\n"); await writeFile(path.join(source, "package.json"), "{}\n"); await writeFile(path.join(source, "empty.txt"), ""); await writeFile(path.join(source, "image.png"), "png"); await writeFile(path.join(source, "run.txt"), "run\n"); await chmod(path.join(source, "run.txt"), 0o755); await symlink("missing.md", path.join(source, "linked.md"));
  const decisions = await collect(source, destination); for (const input of ["nested", "dist", "package.json", "empty.txt", "image.png", "run.txt", "linked.md"]) assert.equal(decisions.find((item) => item.input === input).status, "invalid", input);
});

test("reference source validator reports flatness, count, errors, and text repair warnings without parsing PDFs", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-validate-"); await writeFile(path.join(root, "valid.pdf"), Buffer.from([0, 255, 1])); await writeFile(path.join(root, "needs-repair.txt"), "a\r\n"); await mkdir(path.join(root, "nested")); await writeFile(path.join(root, "empty.md"), ""); await writeFile(path.join(root, "bad.txt"), Buffer.from([0xff])); await chmod(path.join(root, "valid.pdf"), 0o755);
  const result = await validateReferenceSource(root); assert.equal(result.valid, false); assert.equal(result.count, 4); assert.ok(result.errors.some((item) => item.includes("flat"))); assert.ok(result.errors.some((item) => item.includes("empty"))); assert.ok(result.errors.some((item) => item.includes("strict UTF-8"))); assert.ok(result.errors.some((item) => item.includes("executable"))); assert.ok(result.warnings.some((item) => item.includes("needs-repair.txt")));
});

test("reference source plan materialize apply verify retires text and opaque source files", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-reference-lifecycle-"); const source = path.join(root, "source"); const destination = destinationFor(root); const overlay = path.join(root, "overlay"); await mkdir(source); await mkdir(destination, { recursive: true });
  await writeFile(path.join(source, "Citation Export.ris"), "TY  - BOOK\r\nER  -\r\n"); const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 7]); await writeFile(path.join(source, "Primary Scan.pdf"), pdf); await chmod(path.join(source, "Primary Scan.pdf"), 0o640); await writeFile(path.join(destination, "existing.txt"), "keep\n");
  const planFile = path.join(root, "reference.ndjson"); await writePlan(source, destination, planFile); await materializePlan(planFile, overlay); assert.equal((await validateForm("reference-source", overlay)).valid, true); await applyPlan(planFile, overlay); assert.equal((await verifyPlan(planFile, overlay)).valid, true); assert.equal(await readFile(path.join(destination, "citation-export.ris"), "utf8"), "TY  - BOOK\nER  -\n"); assert.deepEqual(await readFile(path.join(destination, "primary-scan.pdf")), pdf); assert.equal((await stat(path.join(destination, "primary-scan.pdf"))).mode & 0o777, 0o640); assert.equal(await readFile(path.join(destination, "existing.txt"), "utf8"), "keep\n"); assert.equal(existsSync(path.join(source, "Citation Export.ris")), false); assert.equal(existsSync(path.join(source, "Primary Scan.pdf")), false);
});
