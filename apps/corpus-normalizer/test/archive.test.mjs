import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { inspectArchive, materializeArchiveToTemp } from "../src/archive.mjs";

function field(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "ascii");
  bytes.copy(buffer, offset, 0, Math.min(bytes.length, length));
}

function tarFile(name, body, mode = 0o644, type = "0") {
  const content = Buffer.from(body);
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  field(header, 100, 8, `${mode.toString(8).padStart(7, "0")}\0`);
  field(header, 108, 8, "0000000\0");
  field(header, 116, 8, "0000000\0");
  field(header, 124, 12, `${content.length.toString(8).padStart(11, "0")}\0`);
  field(header, 136, 12, "00000000000\0");
  header.fill(32, 148, 156);
  header[156] = type.charCodeAt(0);
  field(header, 257, 6, "ustar\0");
  field(header, 263, 2, "00");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  field(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

const archiveOf = (...members) => Buffer.concat([...members, Buffer.alloc(1024)]);
async function rejectsAndCleans(buffer, label, options = {}) { const scratch = await mkdtemp("/var/tmp/corpus-archive-reject-"); const archive = path.join(scratch, `${label}.tar`); const output = path.join(scratch, "output"); await writeFile(archive, buffer); await assert.rejects(() => inspectArchive(archive, options)); await assert.rejects(() => materializeArchiveToTemp(archive, output, options)); await assert.rejects(() => stat(output)); }

test("inspects and materializes a streamed tar while preserving bytes and mode", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-archive-test-");
  const archive = path.join(scratch, "fixture.tar");
  const output = path.join(scratch, "output");
  const body = Buffer.concat([Buffer.from([0, 255, 1, 2]), Buffer.alloc(128 * 1024, 7)]);
  await writeFile(archive, archiveOf(tarFile("wrapper/bin/tool", body, 0o755)));

  const inspected = await inspectArchive(archive, { highWaterMark: 37 });
  assert.equal(inspected.wrapper, "wrapper");
  assert.equal(inspected.members.length, 1);
  assert.equal(inspected.members[0].size, body.length);

  await materializeArchiveToTemp(archive, output, { highWaterMark: 31, stripWrapper: true });
  const target = path.join(output, "bin/tool");
  assert.deepEqual(await readFile(target), body);
  assert.equal((await stat(target)).mode & 0o777, 0o755);
});

test("rejects corrupt, truncated, unsafe, link, special, and duplicate tar members with cleanup", async () => {
  const safe = archiveOf(tarFile("safe", "x")); const checksum = Buffer.from(safe); checksum[0] ^= 1; await rejectsAndCleans(checksum, "checksum"); await rejectsAndCleans(safe.subarray(0, 600), "truncated");
  for (const [label, content] of [["traversal", archiveOf(tarFile("../x", "x"))], ["absolute", archiveOf(tarFile("/x", "x"))], ["symlink", archiveOf(tarFile("link", "", 0o644, "2"))], ["hardlink", archiveOf(tarFile("link", "", 0o644, "1"))], ["fifo", archiveOf(tarFile("pipe", "", 0o644, "6"))], ["duplicate", archiveOf(tarFile("same", "x"), tarFile("same", "y"))]]) await rejectsAndCleans(content, label);
});

test("gzip, lexical order, wrapper stripping, output refusal, and configured limits", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-archive-batch2-"); const raw = archiveOf(tarFile("wrap/z", "z"), tarFile("wrap/a", "a")); const gz = path.join(scratch, "safe.tgz"); await writeFile(gz, gzipSync(raw)); const inspected = await inspectArchive(gz); assert.deepEqual(inspected.members.map((item) => item.path), ["wrap/a", "wrap/z"]);
  const kept = path.join(scratch, "kept"), stripped = path.join(scratch, "stripped"); await materializeArchiveToTemp(gz, kept); await materializeArchiveToTemp(gz, stripped, { stripWrapper: true }); assert.equal(await readFile(path.join(kept, "wrap/a"), "utf8"), "a"); assert.equal(await readFile(path.join(stripped, "a"), "utf8"), "a"); await assert.rejects(() => materializeArchiveToTemp(gz, kept));
  for (const [name, data, options] of [["members", raw, { maxMembers: 1 }], ["expanded", raw, { maxExpandedBytes: 1 }], ["member", archiveOf(tarFile("big", "xx")), { maxMemberBytes: 1 }], ["path", archiveOf(tarFile("longname", "x")), { maxPathLength: 2 }], ["depth", archiveOf(tarFile("a/b/c", "x")), { maxNesting: 2 }]]) await rejectsAndCleans(data, name, options);
});

test("rejects invalid limits and malformed archive termination", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-archive-termination-");
  const archive = path.join(scratch, "fixture.tar");
  await writeFile(archive, archiveOf(tarFile("safe", "x")));
  for (const [name, value] of [["maxMembers", 0], ["maxExpandedBytes", -1], ["maxMemberBytes", 1.5], ["maxPathLength", Number.NaN], ["maxNesting", Number.MAX_SAFE_INTEGER + 1], ["highWaterMark", 0]]) {
    await assert.rejects(() => inspectArchive(archive, { [name]: value }), /positive safe integer/);
  }
  await rejectsAndCleans(Buffer.concat([tarFile("safe", "x"), Buffer.alloc(512)]), "one-zero-block");
  await rejectsAndCleans(Buffer.concat([archiveOf(tarFile("safe", "x")), Buffer.from([1])]), "nonzero-trailer");
});
