import assert from "node:assert/strict";
import { test } from "node:test";
import { importSetOfCslReferences } from "../scripts/import-set-of-csl-references.mjs";

test("importSetOfCslReferences accepts a bare single CSL-JSON item object (not wrapped in an array)", () => {
  // Mirrors what this section's own scripts/resolve-doi.mjs
  // returns for one DOI: a single CSL item object, not an array, so a bare
  // `resolve-doi.mjs ... | import-csl` pipe composes without a wrapping step.
  const singleItem = {
    id: "10.1038/s41567-019-0732-0",
    type: "article-journal",
    title: "The ergodicity problem in economics",
    author: [{ family: "Peters", given: "Ole" }],
    "container-title": "Nature Physics",
    issued: { "date-parts": [[2019, 12, 2]] },
    DOI: "10.1038/s41567-019-0732-0",
  };
  const { references } = importSetOfCslReferences(singleItem);
  assert.deepEqual(Object.keys(references), ["peters2019"]);
  assert.equal(references.peters2019.title, "The ergodicity problem in economics");
  assert.equal(references.peters2019.doi, "10.1038/s41567-019-0732-0");
});

test("importSetOfCslReferences still accepts a CSL-JSON array", () => {
  const { references } = importSetOfCslReferences([
    { id: "caillois1958", type: "book", title: "Les jeux et les hommes", author: [{ family: "Caillois", given: "Roger" }], issued: { "date-parts": [[1958]] } },
  ]);
  assert.deepEqual(Object.keys(references), ["caillois1958"]);
});

test("importSetOfCslReferences refuses a non-object, non-array input", () => {
  assert.throws(() => importSetOfCslReferences("not an item or array"), TypeError);
  assert.throws(() => importSetOfCslReferences(null), TypeError);
});
