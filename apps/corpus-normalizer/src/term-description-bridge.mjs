import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  recognizeTermMarkdown,
  renderTermMarkdown,
} from "@red-cup-engineering/term-engineering-services-section/carrier";
import {
  prepareDescriptionBridge,
  seatDescriptionOverlay,
} from "@red-cup-engineering/term-engineering-services-section/migration";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function flatMarkdownDocuments(root, label) {
  const absolute = path.resolve(root);
  const entries = await readdir(absolute, { withFileTypes: true });
  const invalid = entries.filter((entry) => !entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md");
  if (invalid.length) throw new Error(`${label} must be flat Markdown; found ${invalid.map((entry) => entry.name).join(", ")}`);
  return Promise.all(entries.sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map(async (entry) => ({ filename: entry.name, text: await readFile(path.join(absolute, entry.name), "utf8") })));
}

/** The owner's canonical staging carries its carrier identity: the filename stem, inserted when absent. */
function withCarrierIdentity({ filename, text }) {
  if (!text.startsWith("---\n") || /^identity:/mu.test(text.slice(4, text.indexOf("\n---", 4)))) return { filename, text };
  return { filename, text: `---\nidentity: ${path.basename(filename, path.extname(filename))}\n${text.slice(4)}` };
}

const canonicalStaging = async (root) => (await flatMarkdownDocuments(root, "canonical Markdown staging directory")).map(withCarrierIdentity);

function externalRequest(request) {
  return Object.freeze({
    schema: "corpus-normalizer.term-description-request.v1",
    source: request.source,
    sourceContentSha256: request.sourceSha256,
    name: request.name,
    aliases: request.aliases,
    context: request.context,
  });
}

export async function prepareTermDescriptionRequests(stagingRoot, { maxContextChars = 6000 } = {}) {
  const documents = await canonicalStaging(stagingRoot);
  for (const document of documents) {
    const recognized = recognizeTermMarkdown({ text: document.text, filename: document.filename });
    if (!recognized.term) throw new Error(`staging input is not a Term: ${document.filename}: ${recognized.findings.map(({ message }) => message).join("; ")}`);
    try { renderTermMarkdown({ identity: recognized.identity, name: recognized.name, aliases: recognized.aliases, description: recognized.description, keywords: recognized.keywords.length ? recognized.keywords.join(", ") : undefined, body: recognized.body }); }
    catch (error) { throw new Error(`staging input is not a Term: ${document.filename}: ${error.message}`); }
  }
  return Object.freeze(prepareDescriptionBridge(documents, { maximumContextCharacters: maxContextChars }).map(externalRequest));
}

export async function writeTermDescriptionRequests(stagingRoot, output, options) {
  const outputPath = path.resolve(output);
  const requests = await prepareTermDescriptionRequests(stagingRoot, options);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, requests.map((request) => JSON.stringify(request)).join("\n") + (requests.length ? "\n" : ""), "utf8");
  return Object.freeze({ output: outputPath, count: requests.length, requestsSha256: sha256(await readFile(outputPath)) });
}

async function readProposalRecords(directory) {
  const root = path.resolve(directory);
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json")) throw new Error("proposal directory must be flat JSON records");
  const bySource = new Map();
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    let record;
    try { record = JSON.parse(await readFile(path.join(root, entry.name), "utf8")); }
    catch (error) { throw new Error(`invalid proposal JSON: ${entry.name}: ${error.message}`); }
    const source = record?.request?.source;
    if (typeof source !== "string" || path.basename(source) !== source || path.extname(source) !== ".md") throw new Error(`proposal lacks a safe request.source: ${entry.name}`);
    if (bySource.has(source)) throw new Error(`multiple proposals for source: ${source}`);
    bySource.set(source, record);
  }
  return bySource;
}

function ownerProposal(record, request) {
  if (record?.schema !== "term-description-proposal.v1" || record.disposition !== "proposed") throw new Error(`proposal for ${request.source} was not proposed`);
  if (record.request?.sourceContentSha256 !== request.sourceContentSha256 || record.request?.name !== request.name || JSON.stringify(record.request?.aliases ?? []) !== JSON.stringify(request.aliases)) throw new Error(`proposal witness differs: ${request.source}`);
  if (typeof record.proposal?.description !== "string") throw new Error(`proposal has no description: ${request.source}`);
  return { source: request.source, sourceSha256: request.sourceContentSha256, name: request.name, aliases: request.aliases, description: record.proposal.description };
}

export async function seatTermDescriptionProposals(stagingRoot, proposalDirectory, overlayRoot) {
  const documents = await canonicalStaging(stagingRoot);
  const requests = await prepareTermDescriptionRequests(stagingRoot);
  const records = await readProposalRecords(proposalDirectory);
  const expected = new Set(requests.map(({ source }) => source));
  for (const source of records.keys()) if (!expected.has(source)) throw new Error(`proposal has no staged source: ${source}`);
  for (const request of requests) if (!records.has(request.source)) throw new Error(`missing proposal for source: ${request.source}`);
  let seated;
  try { seated = seatDescriptionOverlay(documents, requests.map((request) => ownerProposal(records.get(request.source), request))); }
  catch (error) { throw new Error(`proposal does not produce DefinedTerm: ${error.message}`, { cause: error }); }
  const overlay = path.resolve(overlayRoot);
  await mkdir(overlay, { recursive: true });
  if ((await readdir(overlay)).length) throw new Error(`description overlay must be empty: ${overlay}`);
  for (const [source, output] of seated.outputs) await writeFile(path.join(overlay, source), output, "utf8");
  const receipts = seated.receipts.map((receipt) => {
    const request = requests.find(({ source }) => source === receipt.source);
    return {
      source: receipt.source,
      sourceContentSha256: receipt.sourceSha256,
      name: request.name,
      aliases: request.aliases,
      proposalSha256: sha256(JSON.stringify(records.get(receipt.source))),
      outputContentSha256: receipt.outputSha256,
    };
  });
  return Object.freeze({ schema: "corpus-normalizer.term-description-seat-receipt.v1", stagingRoot: path.resolve(stagingRoot), overlayRoot: overlay, receipts: Object.freeze(receipts) });
}

export async function verifyTermDescriptionSeating(receipt, overlayRoot = receipt?.overlayRoot) {
  if (receipt?.schema !== "corpus-normalizer.term-description-seat-receipt.v1" || !Array.isArray(receipt.receipts)) throw new TypeError("invalid term description seat receipt");
  const documents = await flatMarkdownDocuments(overlayRoot, "description overlay");
  const actual = new Map(documents.map(({ filename, text }) => [filename, text]));
  const errors = [];
  for (const item of receipt.receipts) {
    const text = actual.get(item.source);
    if (text === undefined) { errors.push(`missing output: ${item.source}`); continue; }
    actual.delete(item.source);
    if (sha256(text) !== item.outputContentSha256) errors.push(`output receipt mismatch: ${item.source}`);
    const recognized = recognizeTermMarkdown({ text, filename: item.source });
    if (!recognized.term) errors.push(`output is not a Term: ${item.source}`);
    if (recognized.name !== item.name) errors.push(`output name mismatch: ${item.source}`);
    if (JSON.stringify(recognized.aliases) !== JSON.stringify(item.aliases)) errors.push(`output aliases mismatch: ${item.source}`);
  }
  for (const extra of actual.keys()) errors.push(`unreceipted output: ${extra}`);
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), receipts: receipt.receipts });
}
