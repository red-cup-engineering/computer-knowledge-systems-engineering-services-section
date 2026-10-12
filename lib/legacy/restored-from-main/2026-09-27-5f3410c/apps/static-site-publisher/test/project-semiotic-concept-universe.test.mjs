import assert from "node:assert/strict";
import test from "node:test";
import { createSemioticConceptUniverse } from "@red-cup-engineering/computer-data-engineering-services-section/signcell/semiotic-concept-universe";
import { projectArtifacts } from "../src/build-projectors.mjs";
import { createSemioticConceptUniverseProjector, renderSemioticConceptUniverseSingleHtml } from "../src/project-semiotic-concept-universe.mjs";

test("a universe contributes durable index and concept HTML through VICTOR", async () => {
  const universe = createSemioticConceptUniverse({ concepts: [{ id: "alpha", title: "Alpha & <one>", body: "Alpha *body*.", tags: [], sameAs: [], publication: { channels: ["public"] }, annotations: [{ kind: "reference", target: "missing" }] }] }).value;
  const projection = await projectArtifacts([createSemioticConceptUniverseProjector({ universe, channels: ["public"] })]);
  assert.equal(projection.report.releasable, true);
  assert.match(projection.artifacts.get("semiotic-concepts/alpha.html").body, /Alpha &amp; &lt;one&gt;/u);
  assert.match(projection.artifacts.get("semiotic-concepts/alpha.html").body, /<em>body<\/em>/u);
  assert.match(renderSemioticConceptUniverseSingleHtml(universe), /Semiotic concept universe/u);
});

test("a publisher may refuse unresolved concept references", async () => {
  const universe = createSemioticConceptUniverse({ concepts: [{ id: "alpha", title: "Alpha", body: "Body.", tags: [], sameAs: [], annotations: [{ kind: "reference", target: "missing" }] }] }).value;
  const projection = await projectArtifacts([createSemioticConceptUniverseProjector({ universe, unresolvedReferences: "refuse" })]);
  assert.equal(projection.report.releasable, false);
  assert.deepEqual(projection.report.errors.map(({ code, subject }) => ({ code, subject })), [{ code: "SCU-unresolved-reference", subject: "alpha" }]);
});
