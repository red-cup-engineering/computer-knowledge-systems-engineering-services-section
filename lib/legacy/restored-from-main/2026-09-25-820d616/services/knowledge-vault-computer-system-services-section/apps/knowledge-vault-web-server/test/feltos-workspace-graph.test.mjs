import assert from "node:assert/strict";
import test from "node:test";

import { createGeodeWorkspaceFeltosGraph } from "../src/feltos-workspace-graph.mjs";

const snapshot = Object.freeze({
  type: "GeodeWorkspaceSnapshot",
  observedAt: "2026-09-09T00:00:00.000Z",
  documents: Object.freeze([
    Object.freeze({ path: "alpha.md", title: "Alpha" }),
    Object.freeze({ path: "beta.md", title: "Beta" }),
  ]),
  graph: Object.freeze({
    edges: Object.freeze([
      Object.freeze({ sourcePath: "alpha.md", kind: "links-to", target: "beta", targetPath: "beta.md", status: "resolved" }),
    ]),
  }),
});

test("projects an admitted CAIRN workspace into the FeltOS graph contract", async () => {
  const graph = await createGeodeWorkspaceFeltosGraph(snapshot);
  assert.equal(graph.summary().type, "GeodeFeltosWorkspaceGraphSummary");
  const links = graph.relations({ predicate: "links-to" });
  assert.equal(links.type, "GeodeFeltosRelationQuery");
  assert.equal(links.total, 1);
  assert.deepEqual(links.relations.map(({ subject, predicate, object }) => ({ subject, predicate, object })), [
    { subject: "alpha.md", predicate: "links-to", object: "beta.md" },
  ]);
  assert.equal(graph.entity("beta.md", { predicate: "links-to", direction: "incoming" }).incomingTotal, 1);
});
