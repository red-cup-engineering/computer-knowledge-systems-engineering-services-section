import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openRevisionIndex, defaultRevisionIndexFile } from "../src/search/revision-index.mjs";
import { openRevisionJournal } from "../src/search/revision-journal.mjs";
import { HISTORICAL_INDEX_SIDECARS } from "../src/search/native-index-custody.mjs";

const scratch = (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cairn-native-custody-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
function custody(root) {
  const visit = (file) => {
    const held = lstatSync(file);
    if (held.isSymbolicLink()) return { link: readlinkSync(file) };
    if (held.isDirectory()) return Object.fromEntries(readdirSync(file).sort().map((name) => [name, visit(path.join(file, name))]));
    return { sha256: createHash("sha256").update(readFileSync(file)).digest("hex"), mode: held.mode };
  };
  return visit(root);
}

for (const explicit of [false, true]) {
  for (const kind of ["header", "bytes", "empty", "directory", "symlink", "dangling", "named-backup", ...HISTORICAL_INDEX_SIDECARS]) {
    test(`real native opening refuses ${kind} custody before ${explicit ? "explicit" : "default"} root creation`, (t) => {
      const directory = scratch(t), file = path.join(directory, kind === "named-backup" ? "retained-backup" : "revisions.sqlite");
      const root = explicit ? path.join(directory, "explicit-native") : `${file}.journal`;
      if (kind === "directory") mkdirSync(file);
      else if (kind === "symlink") { writeFileSync(path.join(directory, "held"), "historical"); symlinkSync("held", file); }
      else if (kind === "dangling") symlinkSync("absent", file);
      else if (HISTORICAL_INDEX_SIDECARS.includes(kind)) writeFileSync(file + kind, "retained orphan");
      else writeFileSync(file, kind === "empty" ? "" : kind === "header" ? "SQLite format 3\u0000inert fixture" : "retained historical bytes");
      const before = custody(directory);
      assert.throws(() => openRevisionIndex(file, explicit ? { root } : {}), /explicit offline receiving/u);
      assert.equal(existsSync(root), false);
      assert.deepEqual(custody(directory), before);
    });
  }
}

test("native opening, admission, search, read, summary and reopen need no Python", (t) => {
  const directory = scratch(t), file = path.join(directory, "revisions.sqlite");
  const previous = process.env.LEGACY_SQLITE_PYTHON;
  process.env.LEGACY_SQLITE_PYTHON = path.join(directory, "unavailable-python");
  t.after(() => { if (previous === undefined) delete process.env.LEGACY_SQLITE_PYTHON; else process.env.LEGACY_SQLITE_PYTHON = previous; });
  const first = openRevisionIndex(file);
  assert.deepEqual(first.admitDocuments([{ source: "native", path: "cedar.md", revision: "one", text: "# Cedar\ncedar fog", at: "2026-01-01" }]), { bodies: 1 });
  const [hit] = first.search("fog");
  assert.equal(first.read(hit.id).text, "# Cedar\ncedar fog");
  assert.equal(first.summary().bodies, 1);
  const before = custody(directory);
  const again = openRevisionIndex(file);
  assert.deepEqual(again.search("fog"), first.search("fog"));
  assert.deepEqual(again.summary(), first.summary());
  assert.deepEqual(custody(directory), before, "reopen leaves the existing native frontier unchanged");
});

test("historical presence is refused even when a native journal already holds an admission", (t) => {
  const directory = scratch(t), file = path.join(directory, "revisions.sqlite"), root = `${file}.journal`;
  const store = openRevisionJournal({ root });
  store.admitBody("a".repeat(40), "Native", 6, "native");
  store.flush();
  store.recordAdmission({ from: file, bodies: 1, occurrences: 0, sources: 0 });
  writeFileSync(file, "old custody stays held");
  const before = custody(directory);
  assert.throws(() => openRevisionIndex(file), /explicit offline receiving/u);
  assert.deepEqual(custody(directory), before, "neither admission nor native frontier authorizes a reset");
});

test("unexpected filesystem errors propagate rather than create an empty index", (t) => {
  const directory = scratch(t), parent = path.join(directory, "not-a-directory"), root = path.join(directory, "native");
  writeFileSync(parent, "held");
  assert.throws(() => openRevisionIndex(path.join(parent, "index"), { root }), { code: "ENOTDIR" });
  assert.equal(existsSync(root), false);
});

test("default locator configuration is preserved and unknown sibling names are not inferred", (t) => {
  const directory = scratch(t), file = path.join(directory, "configured-index");
  assert.equal(defaultRevisionIndexFile({ CAIRN_REVISION_INDEX: file }), file);
  assert.equal(defaultRevisionIndexFile({ XDG_STATE_HOME: directory }), path.join(directory, "561-group", "cairn", "revisions.sqlite"));
  writeFileSync(`${file}.unrelated`, "outside the configured custody contract");
  const index = openRevisionIndex(file, { root: path.join(directory, "explicit-native") });
  assert.equal(index.summary().bodies, 0);
  assert.equal(readFileSync(`${file}.unrelated`, "utf8"), "outside the configured custody contract");
});
