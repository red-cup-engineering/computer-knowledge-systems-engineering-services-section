import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent, verifyJsonSemanticRecord } from "@red-cup-engineering/relation-model-notation-runtime/semantic-content-identity";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createSemanticRecordJournal } from "@red-cup-engineering/eavt/semantic-record";
import { canonicalJsonByteCarrier, jsonByteCarrierValue } from "../../../../../../../../computer-data-engineering-services-section/services/serialized-computer-data-engineering-services-section/services/json-services-section/src/index.mjs";

export const ACTOR = "urn:ame:research-product-admission-service";
export const CUSTOMER = "urn:ame:research-product-consumer";
export const CATEGORY = "research-product-admission";
export const RECORD_OBJECT_KIND = "emsweb.research-product-admission.journal-record";
const REQUIRED_USES = ["notebooklm-transformation", "artificial-intelligence-curriculum", "public-youtube-release"];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const canonical = canonicalJsonByteCarrier;
export function digest(value) { return `sha256:${createHash("sha256").update(value instanceof Uint8Array ? value : canonical(value)).digest("hex")}`; }
const semanticJson = jsonByteCarrierValue;
export function contentId(value) { return identifyJsonSemanticContent({ objectKind: "emsweb.research-product-admission.record", value: semanticJson(value), witnessRoot: EMPTY_WITNESS_ROOT }).token; }

function corpusRoot(path) {
  if (typeof path !== "string" || !path) throw new TypeError("research corpus root is required");
  const root = realpathSync(resolve(path)), stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new TypeError("research corpus root must be one regular directory");
  return root;
}

function contained(root, path) {
  const actual = realpathSync(path);
  if (actual !== root && !actual.startsWith(`${root}/`)) throw new TypeError("research carrier escapes the supplied corpus");
  return actual;
}

function boundedFile(root, path, { minimum, maximum, label }) {
  const actual = contained(root, resolve(path)), stat = lstatSync(actual);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < minimum || stat.size > maximum) throw new TypeError(`research ${label} must be one bounded regular file`);
  return actual;
}

function carrierBytes(carrier) {
  if (!(carrier?.bytes instanceof Uint8Array) || Object.hasOwn(carrier, "path")) throw new TypeError("research carrier requires path-free bytes");
  if (carrier.mediaType !== "text/markdown" || carrier.bytes.length !== carrier.byteLength || digest(carrier.bytes) !== carrier.sha256) throw new TypeError("research carrier bytes changed");
  return carrier.bytes;
}

export function loadResearchDraft({ corpusRoot: rootPath, manifestPath } = {}) {
  const root = corpusRoot(rootPath), manifestFile = boundedFile(root, manifestPath, { minimum: 100, maximum: 1_000_000, label: "manifest" });
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (typeof manifest.carrier !== "string" || !manifest.carrier) throw new TypeError("research manifest requires a carrier");
  const carrierFile = boundedFile(root, resolve(dirname(manifestFile), manifest.carrier), { minimum: 500, maximum: 10 * 1024 * 1024, label: "packet" });
  const bytes = readFileSync(carrierFile), { carrier: _carrier, ...terms } = manifest;
  return { ...terms, carrier: { mediaType: "text/markdown", byteLength: bytes.length, sha256: digest(bytes), bytes } };
}

export function loadResearchDraftForLesson({ corpusRoot: rootPath, courseId, lessonId, revision = 1 } = {}) {
  if (!ID.test(courseId ?? "") || !ID.test(lessonId ?? "") || !Number.isInteger(revision) || revision < 1) throw new TypeError("research draft lookup requires bounded identities");
  const root = corpusRoot(rootPath);
  return loadResearchDraft({ corpusRoot: root, manifestPath: join(root, "manifests", courseId, `${lessonId}.v${revision}.json`) });
}

export function researchDraftAvailable({ corpusRoot: rootPath, courseId, lessonId, revision = 1 } = {}) {
  if (!ID.test(courseId ?? "") || !ID.test(lessonId ?? "") || !Number.isInteger(revision) || revision < 1) throw new TypeError("research draft lookup requires bounded identities");
  const root = corpusRoot(rootPath), manifests = resolve(root, "manifests"), candidate = resolve(manifests, courseId, `${lessonId}.v${revision}.json`);
  if (!candidate.startsWith(`${manifests}/`)) throw new TypeError("research draft lookup escapes its manifest custody");
  return existsSync(candidate) && !lstatSync(candidate).isSymbolicLink() && lstatSync(candidate).isFile();
}

export function admittedResearchProducts(options = {}) {
  const root = resolve(options.dataRoot ?? "data");
  return Object.freeze(createSemanticRecordJournal({ root, objectKind: RECORD_OBJECT_KIND }).query({ category: CATEGORY }).map((row) => structuredClone(row.record)));
}

export function validateResearchDraft(draft) {
  if (!ID.test(draft?.courseId ?? "") || !ID.test(draft?.lessonId ?? "") || !Array.isArray(draft.researchProductClasses) || draft.researchProductClasses.length === 0 || draft.researchProductClasses.some((value) => !ID.test(value))) throw new TypeError("research product requires exact course, lesson, and product classes");
  carrierBytes(draft.carrier);
  if (!Number.isFinite(Date.parse(draft.observedThrough ?? "")) || !Number.isFinite(Date.parse(draft.expiresAt ?? "")) || Date.parse(draft.expiresAt) <= Date.parse(draft.observedThrough)) throw new TypeError("research product requires an ordered freshness interval");
  if (!Array.isArray(draft.citations) || draft.citations.length < 3) throw new TypeError("research product requires at least three primary sources");
  const citationIds = draft.citations.map((row) => row?.id), cited = new Set(citationIds);
  if (citationIds.some((id) => !ID.test(id ?? "")) || cited.size !== citationIds.length || draft.citations.some((row) => { try { const url = new URL(row.url); return url.protocol !== "https:" || !row.kind?.startsWith("primary-") || !row.title || !Array.isArray(row.authors) || row.authors.length === 0 || !Number.isInteger(row.published); } catch { return true; } })) throw new TypeError("research primary-source identities are invalid");
  if (!Array.isArray(draft.claims) || draft.claims.length === 0 || draft.claims.some((row) => !row.statement || !row.scope || !row.warrants?.length || row.warrants.some((id) => !cited.has(id)))) throw new TypeError("research product contains an unwarranted claim");
  for (const [name, value] of [["uncertainty", draft.uncertainty], ["limitations", draft.limitations]]) if (!Array.isArray(value) || value.length === 0 || value.some((row) => typeof row !== "string" || !row.trim())) throw new TypeError(`research product requires explicit ${name}`);
  if (REQUIRED_USES.some((use) => !draft.reuseGrant?.includes(use)) || typeof draft.correctionIdentity !== "string" || !draft.correctionIdentity || draft.privacy?.classification !== "public-synthesis" || draft.internalTransfer?.legalBodyRelation !== "same-legal-body" || draft.internalTransfer.cashSettlementRequired !== false || draft.internalTransfer.status !== "settled-internal-cost-allocation") throw new TypeError("research product lacks reuse, correction, privacy, or settlement terms");
  return true;
}

export async function admitResearchProduct(draft, options = {}) {
  validateResearchDraft(draft);
  const { bytes: _bytes, ...carrier } = draft.carrier;
  const sourceBody = { type: "ResearchSourcePacket", provider: ACTOR, courseId: draft.courseId, lessonId: draft.lessonId, carrier }, sourcePacket = { id: contentId(sourceBody), ...sourceBody };
  const settlementBody = { type: "InternalResearchSettlementReceipt", payer: CUSTOMER, payee: ACTOR, productClass: "research", accountingUnit: draft.internalTransfer.accountingUnit, amountMicros: draft.internalTransfer.allocatedCostMicros, cashSettlementRequired: false, status: "settled", sourcePacket: sourcePacket.id }, settlementReceipt = { id: contentId(settlementBody), ...settlementBody };
  const sourceCorpusDigest = digest({ carrier: draft.carrier.sha256, citations: draft.citations, claims: draft.claims });
  const root = resolve(options.dataRoot ?? "data"), journal = createSemanticRecordJournal({ root, objectKind: RECORD_OBJECT_KIND }), prior = journal.query({ category: CATEGORY }).find((row) => row.record.courseId === draft.courseId && row.record.lessonId === draft.lessonId)?.record;
  if (prior) { if (prior.sourceCorpusDigest === sourceCorpusDigest && prior.correctionIdentity === draft.correctionIdentity) return prior; throw new TypeError("research lesson already has a different immutable product; form a successor correction"); }
  const admittedAt = options.at ?? new Date().toISOString(), body = { type: "ResearchProductAdmission", provider: ACTOR, customer: CUSTOMER, courseId: draft.courseId, lessonId: draft.lessonId, researchProductClasses: [...draft.researchProductClasses], sourcePacket, sourceCorpusDigest, citations: draft.citations, claims: draft.claims, uncertainty: draft.uncertainty, limitations: draft.limitations, observedThrough: draft.observedThrough, expiresAt: draft.expiresAt, reuseGrant: [...draft.reuseGrant], correctionIdentity: draft.correctionIdentity, privacy: draft.privacy, researchSettlementReceipt: settlementReceipt, researchSettlementStatus: "settled", authorityWithheld: ["curriculum-membership", "notebooklm-source-or-generation", "youtube-channel", "upload-schedule-publication"], admittedAt }, product = { id: contentId(body), ...body };
  journal.record({ category: CATEGORY, recordedAt: admittedAt, record: { ...product }, charge: { support: true, refutation: false }, relation: { subject: ACTOR, predicate: "admits", object: product.id } });
  return product;
}

export function researchSourceProjection(product, { bytes } = {}) {
  if (!verifyJsonSemanticRecord({ objectKind: "emsweb.research-product-admission.record", value: semanticJson(product), witnessRoot: EMPTY_WITNESS_ROOT }) || product.type !== "ResearchProductAdmission" || product.provider !== ACTOR || product.customer !== CUSTOMER) throw new TypeError("source projection requires one exact admitted product");
  const carrier = product.sourcePacket?.carrier, candidate = { ...carrier, bytes };
  carrierBytes(candidate);
  return { title: `${product.lessonId.replaceAll("-", " ")} — source-grounded research packet`, digest: carrier.sha256, mediaType: carrier.mediaType, byteLength: bytes.length, bytes };
}

export function deliverResearchProduct(product, source) {
  const objectBody = { type: "ResearchProductDelivery", product, source: researchSourceProjection(product, source) }, object = { id: contentId(objectBody), ...objectBody };
  const body = { type: "Accept", actor: ACTOR, target: CUSTOMER, object }; return { id: contentId(body), ...body };
}
