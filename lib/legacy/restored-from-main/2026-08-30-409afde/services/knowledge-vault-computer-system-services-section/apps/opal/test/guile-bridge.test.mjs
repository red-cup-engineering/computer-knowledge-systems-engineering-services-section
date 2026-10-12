import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createGuileBridge, GuileBridgeHardTimeoutError, GuileBridgeExitedError,
} from "../src/guile-bridge.mjs";

/**
 * These tests exercise a real `guile` subprocess. Guile is not assumed to be present on every
 * machine this repository is checked out on, so availability is probed once, up front, and
 * every test below is registered with `skip` set to a reason rather than failing when it is
 * absent — `npm test` must exit 0 on a machine with no Guile installed.
 */
const guileAvailable = spawnSync("guile", ["--version"], { stdio: "ignore" }).status === 0;
const skip = guileAvailable ? false : "guile is not installed on this machine";

const dependsOnQueryPath = fileURLToPath(
  new URL("../src/scheme/queries/depends-on.scm", import.meta.url));

test("evaluates arithmetic and returns the value as data", { skip }, async () => {
  const bridge = createGuileBridge();
  try {
    const result = await bridge.eval("(+ 1 2 3)");
    assert.equal(result.ok, true);
    assert.equal(result.value, 6);
    assert.equal(result.error, null);
  } finally {
    bridge.close();
  }
});

test("a define in one call is visible to the next — the shared top level", { skip }, async () => {
  const bridge = createGuileBridge();
  try {
    const first = await bridge.eval('(define greeting "hello")');
    assert.equal(first.ok, true);
    const second = await bridge.eval("(string-append greeting \" world\")");
    assert.equal(second.ok, true);
    assert.equal(second.value, "hello world");
  } finally {
    bridge.close();
  }
});

test("display output is captured separately from the return value", { skip }, async () => {
  const bridge = createGuileBridge();
  try {
    const result = await bridge.eval('(display "side effect") (+ 40 2)');
    assert.equal(result.ok, true);
    assert.equal(result.value, 42);
    assert.equal(result.output, "side effect");
  } finally {
    bridge.close();
  }
});

test("a Scheme error comes back as a resolved value, not a rejected promise", { skip }, async () => {
  const bridge = createGuileBridge();
  try {
    const result = await bridge.eval("(car '())");
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
    assert.equal(result.error.key, "wrong-type-arg");
    // The process must still be alive and holding its state after an error.
    const stillAlive = await bridge.eval("(+ 1 1)");
    assert.equal(stillAlive.ok, true);
    assert.equal(stillAlive.value, 2);
  } finally {
    bridge.close();
  }
});

test("an unbound variable comes back as a value too", { skip }, async () => {
  const bridge = createGuileBridge();
  try {
    const result = await bridge.eval("this-is-not-defined-anywhere");
    assert.equal(result.ok, false);
    assert.equal(result.error.key, "unbound-variable");
  } finally {
    bridge.close();
  }
});

test("an infinite loop is interrupted by the in-Guile alarm and the process survives it",
  { skip, timeout: 15_000 }, async () => {
    const bridge = createGuileBridge();
    try {
      await bridge.eval('(define marker "before-timeout")');
      const pidBefore = bridge.pid;
      const started = Date.now();
      const result = await bridge.eval("(let loop () (loop))", { timeoutMs: 1000 });
      const elapsed = Date.now() - started;
      assert.equal(result.ok, false);
      assert.equal(result.error.key, "opal-bridge-timeout");
      // Interrupted close to the requested 1s, not stalled until the Node-side hard watchdog.
      assert.ok(elapsed < 3000, `expected the soft alarm to fire near 1000ms, took ${elapsed}ms`);
      // Same process: the earlier define is still there.
      const after = await bridge.eval("marker");
      assert.equal(after.ok, true);
      assert.equal(after.value, "before-timeout");
      assert.equal(bridge.pid, pidBefore, "the process was not restarted for a soft timeout");
    } finally {
      bridge.close();
    }
  });

test("code that disables its own alarm is still killed by the Node-side hard watchdog",
  { skip, timeout: 15_000 }, async () => {
    const bridge = createGuileBridge();
    try {
      const pidBefore = bridge.pid ?? (await bridge.ping(), bridge.pid);
      // Install a no-op SIGALRM handler and loop forever: defeats the in-Guile soft timeout on
      // purpose, to prove the Node-side kill is a real backstop and not just decoration.
      const evil = "(sigaction SIGALRM (lambda (sig) #f)) (let loop () (loop))";
      await assert.rejects(
        () => bridge.eval(evil, { timeoutMs: 500 }),
        GuileBridgeHardTimeoutError,
      );
      // The bridge recovers: the next call transparently spawns a fresh process.
      const result = await bridge.eval("(+ 5 5)");
      assert.equal(result.ok, true);
      assert.equal(result.value, 10);
      assert.notEqual(bridge.pid, pidBefore, "a fresh process was spawned after the hard kill");
    } finally {
      bridge.close();
    }
  });

test("closing the bridge rejects anything still pending", { skip }, async () => {
  const bridge = createGuileBridge();
  await bridge.ping();
  const pending = bridge.eval("(let loop () (loop))", { timeoutMs: 60_000 });
  bridge.close();
  await assert.rejects(() => pending, GuileBridgeExitedError);
});

test("vectors and alist-of-strings marshal to JSON arrays and objects respectively",
  { skip }, async () => {
    const bridge = createGuileBridge();
    try {
      const result = await bridge.eval(
        '(list (cons "count" 3) (cons "items" (vector "a" "b" "c")))');
      assert.equal(result.ok, true);
      assert.deepEqual(result.value, { count: 3, items: ["a", "b", "c"] });
    } finally {
      bridge.close();
    }
  });

test("the real depends-on query returns correct results over a small EAVT fixture",
  { skip }, async () => {
    const bridge = createGuileBridge();
    try {
      const rows = [
        ["a.md", "depends-on", "total-order", "t1"],
        ["b.md", "depends-on", "bilattice", "t2"],
        ["c.md", "depends-on", "total-order", "t3"], // same concept, different document
        ["d.md", "defines", "bilattice", "t4"], // different relation: must not appear
      ];
      const rowsLiteral = `(vector ${rows.map((row) =>
        `(vector ${row.map((field) => JSON.stringify(field)).join(" ")})`).join(" ")})`;
      const load = await bridge.eval(`(define eavt-rows ${rowsLiteral})`);
      assert.equal(load.ok, true);
      const queryCode = readFileSync(dependsOnQueryPath, "utf8");
      const result = await bridge.eval(queryCode);
      assert.equal(result.ok, true, JSON.stringify(result.error));
      assert.deepEqual(result.value, ["bilattice", "total-order"]);
    } finally {
      bridge.close();
    }
  });
