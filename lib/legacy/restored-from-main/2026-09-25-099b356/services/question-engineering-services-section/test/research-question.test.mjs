import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import { admitResearchQuestion, admitResearchQuestionSet, constructResearchQuestionAdmittedEvent, constructResearchQuestionStatusEvent } from "../src/question.mjs";
import { appendResearchQuestionEvent, readResearchQuestionState, researchQuestionJournalAddress } from "../src/question-journal.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const source = (locator = "science://campaign/questions/one") => ({ type: "ResearchQuestionSource", version: 1, locator, digest });
function candidate(overrides = {}) {
  return {
    type: "ResearchQuestionCandidate",
    version: 1,
    id: "natural-computing-boundary",
    question: "Which observed boundary makes this natural computation distinguishable from its environment?",
    source: source(),
    createdAt: "2026-08-22T15:00:00Z",
    ...overrides,
  };
}

test("admits a sourced question and refuses missing provenance", () => {
  const question = admitResearchQuestion(candidate());
  assert.equal(question.type, "ResearchQuestion");
  assert.equal(question.status, "open");
  assert.equal(question.source.locator, "science://campaign/questions/one");
  assert.ok(Object.isFrozen(question.source));

  const refused = admitResearchQuestion(candidate({ source: { ...source(), digest: "unknown" } }));
  assert.equal(refused.type, "ResearchQuestionRefusal");
  assert.equal(refused.code, "INVALID_SOURCE_DIGEST");
});

test("lifts admission over a set while preserving identity uniqueness", () => {
  const admitted = admitResearchQuestionSet([candidate(), candidate({ id: "second-boundary" })]);
  assert.equal(admitted.type, "ResearchQuestionSet");
  assert.deepEqual(admitted.questions.map(({ id }) => id), ["natural-computing-boundary", "second-boundary"]);

  const duplicate = admitResearchQuestionSet([candidate(), candidate()]);
  assert.equal(duplicate.type, "ResearchQuestionSetRefusal");
  assert.equal(duplicate.code, "DUPLICATE_QUESTION_ID");
});

test("appends dated EAVT witnesses and replays state across explicit partitions", async () => {
  const root = await mkdtemp("/tmp/question-engineering-");
  try {
    const question = admitResearchQuestion(candidate());
    const admittedEvent = constructResearchQuestionAdmittedEvent(question);
    const first = appendResearchQuestionEvent({ root, event: admittedEvent });
    assert.equal(first.type, "ResearchQuestionEventAppendReceipt");
    assert.equal(first.appended, 1);
    assert.equal(first.address.relativePath, "data/logs/2026/08/22/science-questions.jsonl");
    assert.match(await readFile(first.address.filePath, "utf8"), /research-question\/admitted/u);

    const openState = readResearchQuestionState({ root, dates: ["2026-08-22"], questionId: question.id });
    const transition = constructResearchQuestionStatusEvent({
      state: openState,
      to: "partially-addressed",
      reason: "A first assay bounded the environment but did not settle the criterion.",
      source: source("science://campaign/assays/boundary-one"),
      at: "2026-08-23T10:30:00Z",
    });
    const second = appendResearchQuestionEvent({ root, event: transition, historyDates: ["2026-08-22"] });
    assert.equal(second.appended, 1);
    assert.equal(second.address.relativePath, "data/logs/2026/08/23/science-questions.jsonl");

    const current = readResearchQuestionState({ root, dates: ["2026-08-23", "2026-08-22"], questionId: question.id });
    assert.equal(current.type, "ResearchQuestionState");
    assert.equal(current.status, "partially-addressed");
    assert.equal(current.history.length, 2);
    assert.equal(current.questionRecord.source.digest, digest);

    const repeated = appendResearchQuestionEvent({ root, event: transition, historyDates: ["2026-08-22", "2026-08-23"] });
    assert.equal(repeated.appended, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a status witness when its history omits admission", async () => {
  const root = await mkdtemp("/tmp/question-engineering-refusal-");
  try {
    const question = admitResearchQuestion(candidate());
    const state = {
      type: "ResearchQuestionState",
      version: 1,
      id: question.id,
      status: "open",
    };
    const transition = constructResearchQuestionStatusEvent({
      state,
      to: "resolved",
      reason: "A result was reported.",
      source: source("science://results/one"),
      at: "2026-08-24T00:00:00Z",
    });
    const refused = appendResearchQuestionEvent({ root, event: transition });
    assert.equal(refused.type, "ResearchQuestionJournalRefusal");
    assert.equal(refused.code, "STATUS_BEFORE_ADMISSION");
    await assert.rejects(readFile(researchQuestionJournalAddress({ root, at: transition.t }).filePath), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
