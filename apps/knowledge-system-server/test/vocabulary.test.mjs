import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCairnFetchHandler } from "../src/server.mjs";
import { openArchive } from "../src/archive.mjs";
import {
  buildPredicateJsonLd,
  buildTermJsonLd,
  findTermDocuments,
  handleVocabularyRequest,
  negotiateVocabularyFormat,
  ownsVocabularyRequest,
  roomKeyOf,
} from "../src/vocabulary.mjs";

const root = fileURLToPath(new URL("fixtures/vocabulary-vault/", import.meta.url));
const wellFormedPath = "content/text/glossary/terms/well-formed-example.md";

for (const condition of ["missing", "refused", "ambiguous", "ambiguous-with-refused-candidate"]) {
  test(`carrier relation target retains its term IRI when ${condition}`, async () => {
    const original = await openArchive({ root });
    const targetPath = "content/text/glossary/terms/foundational-example.md";
    const duplicatePath = `other/${targetPath}`;
    const documents = original.paths.filter((path) => condition !== "missing" || path !== targetPath).map((path) => ({ path }));
    if (condition.startsWith("ambiguous")) documents.push({ path: duplicatePath });
    let targetReads = 0;
    const workspace = {
      paths: documents.map(({ path }) => path),
      async read(path) {
        if (path === targetPath || path === duplicatePath) {
          targetReads++;
          if (condition === "refused" || (condition === "ambiguous-with-refused-candidate" && path === duplicatePath)) return original.read("content/text/glossary/terms/broken-example.md");
          return original.read(targetPath);
        }
        return original.read(path);
      },
    };
    const response = await handleVocabularyRequest(request("/ns/term/well-formed-example", "application/ld+json"), { archive: workspace });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json())["https://geode.example/ns/predicate/requires"], { "@id": "https://geode.example/ns/term/foundational-example" });
    const turtle = await handleVocabularyRequest(request("/ns/term/well-formed-example", "text/turtle"), { archive: workspace });
    assert.match(await turtle.text(), /<https:\/\/geode\.example\/ns\/predicate\/requires> <https:\/\/geode\.example\/ns\/term\/foundational-example> \./u);
    if (condition.startsWith("ambiguous") || condition === "missing") assert.equal(targetReads, 0);
  });
}

test("literal-range relations stay literal even when their value names one admitted term", async () => {
  const original = await openArchive({ root });
  const workspace = {
    paths: original.paths,
    async read(path) {
      const reading = await original.read(path);
      if (path !== wellFormedPath) return reading;
      return {
        ...reading,
        markdown: reading.markdown.replace("  requires: foundational-example", "  requires: foundational-example\n  baseline-cost: foundational-example"),
      };
    },
  };
  const response = await handleVocabularyRequest(request("/ns/term/well-formed-example", "application/ld+json"), { archive: workspace });
  const document = await response.json();
  assert.equal(document["https://geode.example/ns/predicate/baseline-cost"], "foundational-example");
  assert.deepEqual(document["https://geode.example/ns/predicate/requires"], { "@id": "https://geode.example/ns/term/foundational-example" });
  const turtle = await handleVocabularyRequest(request("/ns/term/well-formed-example", "text/turtle"), { archive: workspace });
  assert.match(await turtle.text(), /<https:\/\/geode\.example\/ns\/predicate\/baseline-cost> "foundational-example" \./u);
});

async function handler() {
  const workspace = await openArchive({ root });
  return createCairnFetchHandler({ archive: workspace });
}

function request(path, accept) {
  return new Request(`https://geode.example${path}`, accept === undefined ? {} : { headers: { accept } });
}

test("negotiateVocabularyFormat ranks Accept, defaulting to html", () => {
  assert.equal(negotiateVocabularyFormat("application/ld+json"), "jsonld");
  assert.equal(negotiateVocabularyFormat("application/json"), "jsonld");
  assert.equal(negotiateVocabularyFormat("text/turtle"), "turtle");
  assert.equal(negotiateVocabularyFormat("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), "html");
  assert.equal(negotiateVocabularyFormat("*/*"), "html");
  assert.equal(negotiateVocabularyFormat(undefined), "html");
  assert.equal(negotiateVocabularyFormat(""), "html");
  assert.equal(negotiateVocabularyFormat("application/json;q=0.5,text/turtle;q=0.9"), "turtle");
});

test("findTermDocuments matches only glossary term files by filename stem", () => {
  const documents = [
    { path: wellFormedPath },
    { path: "content/text/glossary/terms/broken-example.md" },
    { path: "content/text/documents/well-formed-example.md" },
  ];
  const matches = findTermDocuments(documents, "well-formed-example");
  assert.deepEqual(matches.map((document) => document.path), [wellFormedPath]);
  assert.deepEqual(findTermDocuments(documents, "no-such-identity"), []);
});

test("roomKeyOf is the sha256 hex digest of the room's vault-relative path", () => {
  assert.equal(roomKeyOf(wellFormedPath), createHash("sha256").update(wellFormedPath, "utf8").digest("hex"));
});

test("buildTermJsonLd maps relations to predicate IRIs and keeps references/provenance separate, never merged", () => {
  const record = {
    identity: "x", name: "X", body: "Body.", description: "Desc.", "consent-status": "kin-gated",
    aliases: ["Alias"], keywords: ["kw"],
    relations: { "contrasts-with": ["y"], requires: "z" },
    references: { peirce1878: { authors: ["C. S. Peirce"], title: "T", year: 1878 } },
    provenance: { "date-created": "2026-09-01" },
  };
  const document = buildTermJsonLd(record, { baseUrl: "https://l-space.561.group" });
  assert.equal(document["@id"], "https://l-space.561.group/ns/term/x");
  assert.equal(document["@type"], "skos:Concept");
  assert.deepEqual(document["https://l-space.561.group/ns/predicate/contrasts-with"], ["y"]);
  assert.equal(document["https://l-space.561.group/ns/predicate/requires"], "z");
  assert.equal(document.relations, undefined);
  assert.deepEqual(document.references, record.references);
  assert.deepEqual(document.provenance, record.provenance);
  assert.equal(JSON.stringify(document).includes("ni:"), false);
});

test("buildPredicateJsonLd never carries an ni: identity", () => {
  const document = buildPredicateJsonLd({ name: "requires", authority: "test-authority", baseUrl: "https://l-space.561.group" });
  assert.equal(document["@id"], "https://l-space.561.group/ns/predicate/requires");
  assert.equal(document["@type"], "rdf:Property");
  assert.equal(JSON.stringify(document).includes("ni:"), false);
});

test("buildPredicateJsonLd carries closeMatch for an mld identification and exactMatch for an equal one, and neither when there are none", () => {
  const base = { name: "part-of", authority: "test-authority", baseUrl: "https://l-space.561.group" };
  const bare = buildPredicateJsonLd(base);
  assert.equal(bare.closeMatch, undefined);
  assert.equal(bare.exactMatch, undefined);

  const close = buildPredicateJsonLd({ ...base, identifications: [{ other: "component-of", property: "http://www.w3.org/2004/02/skos/core#closeMatch" }] });
  assert.deepEqual(close.closeMatch, ["https://l-space.561.group/ns/predicate/component-of"]);
  assert.equal(close.exactMatch, undefined);
  assert.equal(close["@context"].closeMatch, "skos:closeMatch");

  const exact = buildPredicateJsonLd({ ...base, identifications: [{ other: "constituent-of", property: "http://www.w3.org/2004/02/skos/core#exactMatch" }] });
  assert.deepEqual(exact.exactMatch, ["https://l-space.561.group/ns/predicate/constituent-of"]);
  assert.equal(exact.closeMatch, undefined);
});

test("ownsVocabularyRequest matches only /ns/term/ and /ns/predicate/", () => {
  assert.equal(ownsVocabularyRequest(request("/ns/term/x")), true);
  assert.equal(ownsVocabularyRequest(request("/ns/predicate/x")), true);
  assert.equal(ownsVocabularyRequest(request("/ns/term/")), false);
  assert.equal(ownsVocabularyRequest(request("/api/workspace")), false);
});

test("GET /ns/term/<identity> serves live JSON-LD for an admitted term, @id and predicate IRIs correct", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/term/well-formed-example", "application/ld+json"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/ld+json; charset=utf-8");
  const document = await response.json();
  assert.equal(document["@id"], "https://geode.example/ns/term/well-formed-example");
  assert.deepEqual(document["https://geode.example/ns/predicate/contrasts-with"], [{ "@id": "https://geode.example/ns/term/dual-of-example" }]);
  assert.deepEqual(document["https://geode.example/ns/predicate/requires"], { "@id": "https://geode.example/ns/term/foundational-example" });
  assert.equal(JSON.stringify(document).includes("ni:"), false);
});

test("reciprocal admitted term relations resolve to each term's canonical URI", async () => {
  const respond = await handler();
  const [source, target] = await Promise.all([
    respond(request("/ns/term/well-formed-example", "application/ld+json")),
    respond(request("/ns/term/foundational-example", "application/ld+json")),
  ]);
  const [sourceDocument, targetDocument] = await Promise.all([source.json(), target.json()]);
  const predicate = "https://geode.example/ns/predicate/requires";
  assert.deepEqual(sourceDocument[predicate], { "@id": "https://geode.example/ns/term/foundational-example" });
  assert.deepEqual(targetDocument[predicate], { "@id": "https://geode.example/ns/term/well-formed-example" });
});

test("GET /ns/term/<identity> serves Turtle for the same admitted term", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/term/well-formed-example", "text/turtle"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/turtle; charset=utf-8");
  const body = await response.text();
  assert.match(body, /<https:\/\/geode\.example\/ns\/term\/well-formed-example> <http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label> "Well-Formed Example" \./u);
  assert.match(body, /<https:\/\/geode\.example\/ns\/predicate\/requires> <https:\/\/geode\.example\/ns\/term\/foundational-example> \./u);
  assert.equal(body.includes("ni:"), false);
});

test("GET /ns/term/<identity> with an HTML Accept 303s a public term to its public room, never rendering new HTML", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/term/well-formed-example", "text/html"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `https://geode.example/#/public/${roomKeyOf(wellFormedPath)}`);
  assert.equal(await response.text(), "");
});

test("GET /ns/term/<identity> with an HTML Accept 303s a non-public term to its admission-guarded room", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/term/private-example", "text/html"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `https://geode.example/#/room/${roomKeyOf("content/text/glossary/terms/private-example.md")}`);
});

for (const identity of ["private-example", "gated-example"]) {
  test(`GET /ns/term/${identity} serves no graph and no findings outside the public surface policy`, async () => {
    const respond = await handler();
    for (const accept of ["application/ld+json", "text/turtle"]) {
      const response = await respond(request(`/ns/term/${identity}`, accept));
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "unknown identity", identity });
    }
  });
}

test("GET /ns/term/<identity> defaults to the HTML redirect for a default-browser Accept", async () => {
  const respond = await handler();
  const response = await respond(request(
    "/ns/term/well-formed-example",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  ));
  assert.equal(response.status, 303);
});

test("GET /ns/term/<identity> for a term that fails admission is 422 with typed findings, never a graph", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/term/broken-example", "application/ld+json"));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.identity, "broken-example");
  assert.ok(body.findings.some((finding) => finding.rule === "unknown-key"));
});

test("GET /ns/term/<identity> for an unknown identity is 404 with {error, identity}", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/term/no-such-term", "application/ld+json"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "unknown identity", identity: "no-such-term" });
});

test("GET /ns/predicate/<name> serves JSON-LD and Turtle for an authorized predicate", async () => {
  const respond = await handler();
  const jsonLd = await respond(request("/ns/predicate/contrasts-with", "application/ld+json"));
  assert.equal(jsonLd.status, 200);
  const document = await jsonLd.json();
  assert.equal(document["@id"], "https://geode.example/ns/predicate/contrasts-with");
  assert.match(document.source, /relation-predicates\.json$/u);

  const turtle = await respond(request("/ns/predicate/contrasts-with", "text/turtle"));
  assert.equal(turtle.status, 200);
  assert.match(await turtle.text(), /ns\/predicate\/contrasts-with>.*rdf-syntax-ns#Property/su);
});

test("GET /ns/predicate/<name> with no page yet renders a minimal plain HTML page, not a redirect", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/predicate/requires", "text/html"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await response.text();
  assert.match(body, /<h1>requires<\/h1>/u);
  assert.match(body, /relation-predicates\.json/u);
});

test("GET /ns/predicate/<name> for an unknown predicate is 404 with {error, identity}", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/predicate/not-a-real-predicate", "application/ld+json"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "unknown identity", identity: "not-a-real-predicate" });
});

test("GET /ns/predicate/<name> for a predicate the ledger never identifies carries no closeMatch or exactMatch", async () => {
  const respond = await handler();
  const response = await respond(request("/ns/predicate/see-also", "application/ld+json"));
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.equal(document.closeMatch, undefined);
  assert.equal(document.exactMatch, undefined);
});
