import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { unpackArchive } from "../src/archive-transaction.mjs";
import { completeRoute, receiptRouteTask, retireRouteArchive } from "../src/route-completion.mjs";
import { applyPlan, materializePlan } from "../src/materialize.mjs";
import { prepareRouteTask } from "../src/route-task.mjs";
import { collectRoutePlan, writeRoutePlan } from "../src/router.mjs";

function tar(name, content) { const body = Buffer.from(content), header = Buffer.alloc(512); Buffer.from(name).copy(header); Buffer.from("0000644\0").copy(header, 100); Buffer.from(`${body.length.toString(8).padStart(11, "0")}\0`).copy(header, 124); Buffer.from("00000000000\0").copy(header, 136); header.fill(32, 148, 156); header[156] = 48; Buffer.from("ustar\0").copy(header, 257); Buffer.from("00").copy(header, 263); const sum = header.reduce((value, byte) => value + byte, 0); Buffer.from(`${sum.toString(8).padStart(6, "0")}\0 `).copy(header, 148); return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]); }
async function task(route, source, destination, form) { await writeRoutePlan(source, destination, route); return (await collectRoutePlan(source, destination)).find(record => record.kind === "task" && record.form === form); }

test("completion requires an authenticated receipt for every supported task and leaves nonempty source directories alone", async () => {
  const root = await mkdtemp("/var/tmp/route-completion-"); const source = path.join(root, "source"), destination = path.join(root, "out-services-section"), route = path.join(root, "route.ndjson"), artifact = path.join(root, "artifact.ndjson"), overlay = path.join(root, "overlay"), receipt = path.join(root, "receipt.json"), completion = path.join(root, "completion.json");
  await mkdir(path.join(source, "content/text/glossary/terms"), { recursive: true }); await writeFile(path.join(source, "content/text/glossary/terms/a.md"), "# A\n"); const selected = await task(route, source, destination, "term"); await prepareRouteTask(route, selected.id, artifact); await materializePlan(artifact, overlay); await rm(path.join(source, "content/text/glossary/terms/a.md"));
  await assert.rejects(() => receiptRouteTask(route, selected.id, artifact, overlay, receipt), /destination invalid|destination hash mismatch/); await rm(overlay, { recursive: true, force: true }); await writeFile(path.join(source, "content/text/glossary/terms/a.md"), "# A\n"); await materializePlan(artifact, overlay); await applyPlan(artifact, overlay); await receiptRouteTask(route, selected.id, artifact, overlay, receipt); const result = await completeRoute(route, [receipt], completion);
  assert.equal(result.complete, true); assert.equal(existsSync(source), true); assert.equal(existsSync(path.join(source, "content")), false);
});

test("invalid tasks prevent completion even when a receipt is fabricated", async () => {
  const root = await mkdtemp("/var/tmp/route-completion-invalid-"); const source = path.join(root, "source"), destination = path.join(root, "out-services-section"), route = path.join(root, "route.ndjson"), receipt = path.join(root, "receipt.json"); await mkdir(source); await writeFile(path.join(source, "unknown.bin"), Buffer.from([0])); await task(route, source, destination, "invalid"); await writeFile(receipt, "{}\n");
  await assert.rejects(() => completeRoute(route, [receipt], path.join(root, "completion.json")), /unresolved invalid/);
});

test("an archive carrier retires only after its extracted route has completed and remains bound to its manifest", async () => {
  const root = await mkdtemp("/var/tmp/route-completion-archive-"); const source = path.join(root, "source"), destination = path.join(root, "out-services-section"), route = path.join(root, "route.ndjson"); await mkdir(source); const carrier = path.join(source, "safe.tar"); await writeFile(carrier, tar("wrapped/content/text/glossary/terms/a.md", "# A\n")); const outer = await task(route, source, destination, "archive-inspect");
  const extracted = path.join(root, "extracted"), unpacked = await unpackArchive(carrier, extracted, { stripWrapper: true }), nestedRoute = path.join(root, "nested-route.ndjson"), nestedDestination = path.join(root, "nested-services-section"), nestedTask = await task(nestedRoute, extracted, nestedDestination, "term"), artifact = path.join(root, "nested-artifact.ndjson"), overlay = path.join(root, "nested-overlay"), nestedReceipt = path.join(root, "nested-receipt.json"), nestedCompletion = path.join(root, "nested-completion.json"); await prepareRouteTask(nestedRoute, nestedTask.id, artifact); await materializePlan(artifact, overlay); await applyPlan(artifact, overlay); await receiptRouteTask(nestedRoute, nestedTask.id, artifact, overlay, nestedReceipt); await completeRoute(nestedRoute, [nestedReceipt], nestedCompletion);
  const archiveReceipt = path.join(root, "archive-receipt.json"); await retireRouteArchive(route, outer.id, unpacked.manifest, nestedCompletion, archiveReceipt); assert.equal(existsSync(carrier), false); const outerCompletion = await completeRoute(route, [archiveReceipt], path.join(root, "outer-completion.json")); assert.equal(outerCompletion.complete, true);
});
