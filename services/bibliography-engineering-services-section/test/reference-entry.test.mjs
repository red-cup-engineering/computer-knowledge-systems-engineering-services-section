import assert from "node:assert/strict";
import { test } from "node:test";
import { admitReferenceEntry } from "../schemas/bibliography/reference-entry.schema.mjs";

test("admitReferenceEntry admits a well-shaped entry", () => {
  const admitted = admitReferenceEntry("caillois1958", { authors: ["Caillois, Roger"], title: "Les jeux et les hommes", year: 1958 });
  assert.equal(admitted.title, "Les jeux et les hommes");
});

test("admitReferenceEntry rejects an invalid citekey", () => {
  assert.throws(() => admitReferenceEntry("Caillois-1958", { authors: ["Caillois, Roger"], title: "t", year: 1958 }), TypeError);
});

test("admitReferenceEntry rejects a field outside the closed contract", () => {
  assert.throws(() => admitReferenceEntry("caillois1958", { authors: ["Caillois, Roger"], title: "t", year: 1958, journal: "not admitted here" }), RangeError);
});

test("admitReferenceEntry requires authors, title, and year", () => {
  assert.throws(() => admitReferenceEntry("caillois1958", { title: "t", year: 1958 }), TypeError);
});

test("admitReferenceEntry validates url as a URI when present", () => {
  assert.throws(() => admitReferenceEntry("caillois1958", { authors: ["Caillois, Roger"], title: "t", year: 1958, url: "not a uri" }), TypeError);
  const admitted = admitReferenceEntry("caillois1958", { authors: ["Caillois, Roger"], title: "t", year: 1958, url: "https://example.org/x" });
  assert.equal(admitted.url, "https://example.org/x");
});
