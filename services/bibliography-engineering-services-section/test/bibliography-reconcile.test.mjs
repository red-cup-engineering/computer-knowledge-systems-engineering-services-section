import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileReferences } from "../src/bibliography-reconcile.mjs";

function triple(citekey, reference, path) { return { citekey, reference, path }; }
function carrier(path, recognized) { return { citekey: recognized.key ?? null, path, recognized }; }
function citation(path, citekey) { return { path, citekey }; }

test("reconcileReferences finds no health defects over a clean, fully covered corpus", () => {
  const triples = [triple("euler1736", { authors: ["Euler, Leonhard"], title: "Solutio problematis", year: 1736 }, "a.md")];
  const carriers = [carrier("bibliographies/euler1736.md", { admitted: true, key: "euler1736", authors: ["Euler, Leonhard"], title: "Solutio problematis", year: 1736 })];
  const health = reconcileReferences({ triples, carriers });
  assert.deepEqual(health.conflicts, []);
  assert.deepEqual(health.probableDuplicates, []);
  assert.deepEqual(health.uncoveredCitekeys, []);
  assert.deepEqual(health.citekeysWithoutCarrier, []);
  assert.deepEqual(health.orphanCarriers, []);
});

test("reconcileReferences reports a conflict when the same citekey names materially different works", () => {
  const triples = [
    triple("euler1736", { authors: ["Euler, Leonhard"], title: "Solutio problematis", year: 1736 }, "a.md"),
    triple("euler1736", { authors: ["Euler, Leonhard"], title: "A completely different title", year: 1736 }, "b.md"),
  ];
  const health = reconcileReferences({ triples, carriers: [] });
  assert.equal(health.conflicts.length, 1);
  assert.equal(health.conflicts[0].citekey, "euler1736");
  assert.equal(health.conflicts[0].variants.length, 2);
});

test("reconcileReferences does not report a conflict for two identical inline declarations", () => {
  const triples = [
    triple("euler1736", { authors: ["Euler, Leonhard"], title: "Solutio problematis", year: 1736 }, "a.md"),
    triple("euler1736", { authors: ["Euler, Leonhard"], title: "Solutio problematis", year: 1736 }, "b.md"),
  ];
  const health = reconcileReferences({ triples, carriers: [] });
  assert.deepEqual(health.conflicts, []);
});

test("reconcileReferences reports probable duplicates for two citekeys naming the same work", () => {
  const triples = [
    triple("caillois1958", { authors: ["Caillois, Roger"], title: "Man, Play, and Games", year: 1958 }, "a.md"),
    triple("caillois1958b", { authors: ["Caillois, Roger"], title: "Man, Play, and Games", year: 1958 }, "b.md"),
  ];
  const health = reconcileReferences({ triples, carriers: [] });
  assert.equal(health.probableDuplicates.length, 1);
  assert.deepEqual(health.probableDuplicates[0].citekeys, ["caillois1958", "caillois1958b"]);
});

test("reconcileReferences does not flag an ordinary depth-1-only citekey as uncovered — an absent carrier is not a health failure", () => {
  const triples = [triple("caillois1958", { authors: ["Caillois, Roger"], title: "Man, Play, and Games", year: 1958 }, "a.md")];
  const health = reconcileReferences({ triples, carriers: [] });
  assert.deepEqual(health.uncoveredCitekeys, []);
});

test("reconcileReferences reports an inline [@x] citation as uncovered when its key is absent from that file's depth-1 map", () => {
  const citations = [citation("a.md", "caillois1958")];
  const health = reconcileReferences({ triples: [], carriers: [], citations });
  assert.equal(health.uncoveredCitekeys.length, 1);
  assert.equal(health.uncoveredCitekeys[0].citekey, "caillois1958");
  assert.deepEqual(health.uncoveredCitekeys[0].citedFrom, ["a.md"]);
});

test("reconcileReferences does not report an inline citation as uncovered when its key is present in that file's depth-1 map", () => {
  const triples = [triple("caillois1958", { authors: ["Caillois, Roger"], title: "Man, Play, and Games", year: 1958 }, "a.md")];
  const citations = [citation("a.md", "caillois1958")];
  const health = reconcileReferences({ triples, carriers: [], citations });
  assert.deepEqual(health.uncoveredCitekeys, []);
});

test("reconcileReferences reports an inline citation as uncovered when its key is in a DIFFERENT file's map, not its own", () => {
  const triples = [triple("caillois1958", { authors: ["Caillois, Roger"], title: "Man, Play, and Games", year: 1958 }, "elsewhere.md")];
  const citations = [citation("a.md", "caillois1958")];
  const health = reconcileReferences({ triples, carriers: [], citations });
  assert.equal(health.uncoveredCitekeys.length, 1);
  assert.deepEqual(health.uncoveredCitekeys[0].citedFrom, ["a.md"]);
});

test("reconcileReferences reports a bracketed multi-key citation as two uncovered citekeys", () => {
  const citations = [citation("a.md", "caillois1958"), citation("a.md", "caillois1958b")];
  const health = reconcileReferences({ triples: [], carriers: [], citations });
  assert.deepEqual(health.uncoveredCitekeys.map((entry) => entry.citekey), ["caillois1958", "caillois1958b"]);
});

test("reconcileReferences puts a carrier-less depth-1 citekey in citekeysWithoutCarrier, not in uncoveredCitekeys", () => {
  const triples = [triple("caillois1958", { authors: ["Caillois, Roger"], title: "Man, Play, and Games", year: 1958 }, "a.md")];
  const health = reconcileReferences({ triples, carriers: [] });
  assert.deepEqual(health.uncoveredCitekeys, []);
  assert.equal(health.citekeysWithoutCarrier.length, 1);
  assert.equal(health.citekeysWithoutCarrier[0].citekey, "caillois1958");
  assert.deepEqual(health.citekeysWithoutCarrier[0].citedFrom, ["a.md"]);
});

test("reconcileReferences reports an orphan carrier when no reference cites it", () => {
  const carriers = [carrier("bibliographies/euler1736.md", { admitted: true, key: "euler1736", authors: ["Euler, Leonhard"], title: "Solutio problematis", year: 1736 })];
  const health = reconcileReferences({ triples: [], carriers });
  assert.equal(health.orphanCarriers.length, 1);
  assert.equal(health.orphanCarriers[0].citekey, "euler1736");
});
