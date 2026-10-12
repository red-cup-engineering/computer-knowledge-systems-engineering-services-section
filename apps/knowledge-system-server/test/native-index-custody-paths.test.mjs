import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertNativeIndexCustody, historicalIndexCustodyPaths } from "../src/search/native-index-custody.mjs";

test("the exact configured custody carriers refuse files, directories and dangling symlinks", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "cairn-custody-carriers-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "named-retained-backup");
  for (const carrier of historicalIndexCustodyPaths(file)) {
    writeFileSync(carrier, "unchanged historical custody");
    assert.throws(() => assertNativeIndexCustody(file), /explicit offline receiving/u);
    assert.equal(readFileSync(carrier, "utf8"), "unchanged historical custody");
    rmSync(carrier);
    mkdirSync(carrier);
    assert.throws(() => assertNativeIndexCustody(file), /explicit offline receiving/u);
    assert.deepEqual(readdirSync(carrier), []);
    rmSync(carrier, { recursive: true });
    symlinkSync("absent", carrier);
    assert.throws(() => assertNativeIndexCustody(file), /explicit offline receiving/u);
    assert.equal(readlinkSync(carrier), "absent");
    rmSync(carrier);
  }
  mkdirSync(`${file}.journal`);
  assert.doesNotThrow(() => assertNativeIndexCustody(file));
  assert.deepEqual(readdirSync(directory), ["named-retained-backup.journal"]);
});
