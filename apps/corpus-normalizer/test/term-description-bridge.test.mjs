import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { prepareTermDescriptionRequests, seatTermDescriptionProposals, verifyTermDescriptionSeating, writeTermDescriptionRequests } from "../src/term-description-bridge.mjs";

async function fixture() { const root = await mkdtemp("/var/tmp/term-description-bridge-"); const staging = path.join(root, "staging"); const proposals = path.join(root, "proposals"); await mkdir(staging); await mkdir(proposals); return { root, staging, proposals }; }
const term = (name, aliases = []) => `---\nname: ${JSON.stringify(name)}\n${aliases.length ? `aliases:\n${aliases.map((value) => `  - ${JSON.stringify(value)}`).join("\n")}\n` : ""}---\n\nLonger source body about ${name}.\n`;

test("prepares sorted bounded inference requests using the shared Term grammar", async () => {
  const { root, staging } = await fixture(); await writeFile(path.join(staging, "zeta.md"), term("Zeta")); await writeFile(path.join(staging, "alpha.md"), term("Alpha", ["first"]));
  const requests = await prepareTermDescriptionRequests(staging, { maxContextChars: 12 });
  assert.deepEqual(requests.map((request) => request.source), ["alpha.md", "zeta.md"]); assert.equal(requests[0].name, "Alpha"); assert.deepEqual(requests[0].aliases, ["first"]); assert.ok(requests[0].context.length <= 12); assert.match(requests[0].sourceContentSha256, /^[a-f0-9]{64}$/);
  const written = await writeTermDescriptionRequests(staging, path.join(root, "requests.ndjson")); assert.equal(written.count, 2); assert.equal((await readFile(written.output, "utf8")).trim().split("\n").length, 2);
});

test("seats exactly one matching proposal per source through the owner's canonical carrier", async () => {
  const { staging, proposals, root } = await fixture(); const source = term("Computer File", ["file"]); await writeFile(path.join(staging, "computer-file.md"), source);
  const [request] = await prepareTermDescriptionRequests(staging); const proposal = { schema: "term-description-proposal.v1", disposition: "proposed", request, proposal: { description: "A computer file is a named sequence of digital data. The term is used in filesystems and other public digital information contexts." } }; await writeFile(path.join(proposals, "000001.json"), JSON.stringify(proposal));
  const receipt = await seatTermDescriptionProposals(staging, proposals, path.join(root, "overlay")); assert.equal(receipt.receipts.length, 1); assert.equal((await verifyTermDescriptionSeating(receipt)).valid, true);
  const output = await readFile(path.join(root, "overlay", "computer-file.md"), "utf8"); assert.match(output, /^description: A computer file/m); assert.match(output, /Longer source body about Computer File/); assert.doesNotMatch(output, /^(?:slug|defines|related|type|title):/m);
});

test("refuses incomplete, duplicate, mismatched, and non-DefinedTerm proposal results", async () => {
  const { staging, proposals, root } = await fixture(); await writeFile(path.join(staging, "term.md"), term("Term")); const [request] = await prepareTermDescriptionRequests(staging);
  await assert.rejects(() => seatTermDescriptionProposals(staging, proposals, path.join(root, "missing")), /missing proposal/);
  const invalid = { schema: "term-description-proposal.v1", disposition: "proposed", request, proposal: { description: "A description split\nacross two lines." } }; await writeFile(path.join(proposals, "one.json"), JSON.stringify(invalid)); await assert.rejects(() => seatTermDescriptionProposals(staging, proposals, path.join(root, "bad")), /does not produce DefinedTerm/);
  await writeFile(path.join(proposals, "two.json"), JSON.stringify(invalid)); await assert.rejects(() => seatTermDescriptionProposals(staging, proposals, path.join(root, "duplicate")), /multiple proposals/);
});

test("rejects staged files that the shared grammar does not recognize as Term", async () => {
  const { staging } = await fixture(); await writeFile(path.join(staging, "wrong.md"), "---\nname: \"Right Name\"\n---\n"); await assert.rejects(() => prepareTermDescriptionRequests(staging), /not a Term/);
});
