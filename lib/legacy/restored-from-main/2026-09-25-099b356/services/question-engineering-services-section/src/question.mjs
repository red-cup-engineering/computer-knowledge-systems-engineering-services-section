import { eavtRow } from "@red-cup-engineering/eavt/row";

export const RESEARCH_QUESTION_STATUSES = Object.freeze(["open", "partially-addressed", "resolved"]);
export const RESEARCH_QUESTION_ADMITTED_ATTRIBUTE = "research-question/admitted";
export const RESEARCH_QUESTION_STATUS_ATTRIBUTE = "research-question/status-transition";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const STATUS = new Set(RESEARCH_QUESTION_STATUSES);
const TRANSITIONS = Object.freeze({
  open: new Set(["partially-addressed", "resolved"]),
  "partially-addressed": new Set(["open", "resolved"]),
  resolved: new Set(["open"]),
});

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value, keys) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function refusal(code, message, path = null) {
  return immutable({ type: "ResearchQuestionRefusal", version: 1, code, message, path });
}

function admitSource(source, path = "source") {
  if (!exact(source, ["type", "version", "locator", "digest"]) || source.type !== "ResearchQuestionSource" || source.version !== 1) {
    return refusal("INVALID_SOURCE", `${path} must be ResearchQuestionSource@1 with locator and digest`, path);
  }
  if (typeof source.locator !== "string" || source.locator.trim() === "") return refusal("INVALID_SOURCE_LOCATOR", `${path}.locator must be nonempty text`, `${path}.locator`);
  if (typeof source.digest !== "string" || !DIGEST.test(source.digest)) return refusal("INVALID_SOURCE_DIGEST", `${path}.digest must be a lowercase SHA-256 digest`, `${path}.digest`);
  return immutable({ type: "ResearchQuestionSource", version: 1, locator: source.locator.trim(), digest: source.digest });
}

function validInstant(value) {
  return typeof value === "string" && INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

export function researchQuestionEntity(id) {
  if (typeof id !== "string" || !ID.test(id)) throw new TypeError("research question id must be lowercase words separated by single hyphens");
  return `research-question:${id}`;
}

export function researchQuestionIdFromEntity(entity) {
  if (typeof entity !== "string" || !entity.startsWith("research-question:")) return null;
  const id = entity.slice("research-question:".length);
  return ID.test(id) ? id : null;
}

export function admitResearchQuestion(candidate) {
  if (!exact(candidate, ["type", "version", "id", "question", "source", "createdAt"]) || candidate.type !== "ResearchQuestionCandidate" || candidate.version !== 1) {
    return refusal("INVALID_CANDIDATE", "candidate must be ResearchQuestionCandidate@1 with id, question, source, and createdAt", "candidate");
  }
  if (typeof candidate.id !== "string" || !ID.test(candidate.id)) return refusal("INVALID_ID", "id must be lowercase words separated by single hyphens", "candidate.id");
  if (typeof candidate.question !== "string" || candidate.question.trim() === "") return refusal("INVALID_QUESTION", "question must be nonempty text", "candidate.question");
  if (!validInstant(candidate.createdAt)) return refusal("INVALID_CREATED_AT", "createdAt must be a valid UTC instant", "candidate.createdAt");
  const source = admitSource(candidate.source, "candidate.source");
  if (source.type === "ResearchQuestionRefusal") return source;
  return immutable({
    type: "ResearchQuestion",
    version: 1,
    id: candidate.id,
    question: candidate.question.trim(),
    source,
    createdAt: candidate.createdAt,
    status: "open",
  });
}

export function admitResearchQuestionSet(candidates) {
  if (!Array.isArray(candidates)) return immutable({ type: "ResearchQuestionSetRefusal", version: 1, code: "INVALID_CANDIDATES", message: "candidates must be an array", index: null, cause: null });
  const questions = [];
  const ids = new Set();
  for (let index = 0; index < candidates.length; index += 1) {
    const question = admitResearchQuestion(candidates[index]);
    if (question.type === "ResearchQuestionRefusal") return immutable({ type: "ResearchQuestionSetRefusal", version: 1, code: "QUESTION_REFUSED", message: `question candidate ${index} was refused`, index, cause: question });
    if (ids.has(question.id)) return immutable({ type: "ResearchQuestionSetRefusal", version: 1, code: "DUPLICATE_QUESTION_ID", message: `question id ${question.id} occurs more than once`, index, cause: null });
    ids.add(question.id);
    questions.push(question);
  }
  return immutable({ type: "ResearchQuestionSet", version: 1, questions });
}

export function constructResearchQuestionAdmittedEvent(question) {
  if (!exact(question, ["type", "version", "id", "question", "source", "createdAt", "status"]) || question.type !== "ResearchQuestion" || question.version !== 1 || question.status !== "open") {
    throw new TypeError("question must be an admitted ResearchQuestion@1 in open status");
  }
  return eavtRow({ e: researchQuestionEntity(question.id), a: RESEARCH_QUESTION_ADMITTED_ATTRIBUTE, v: question, t: question.createdAt });
}

export function constructResearchQuestionStatusEvent({ state, to, reason, source, at }) {
  if (!record(state) || state.type !== "ResearchQuestionState" || state.version !== 1 || !STATUS.has(state.status)) throw new TypeError("state must be ResearchQuestionState@1");
  if (!STATUS.has(to)) throw new TypeError(`to must be one of: ${RESEARCH_QUESTION_STATUSES.join(", ")}`);
  if (!TRANSITIONS[state.status].has(to)) throw new TypeError(`status transition ${state.status} -> ${to} is not admitted`);
  if (typeof reason !== "string" || reason.trim() === "") throw new TypeError("reason must be nonempty text");
  if (!validInstant(at)) throw new TypeError("at must be a valid UTC instant");
  const admittedSource = admitSource(source, "source");
  if (admittedSource.type === "ResearchQuestionRefusal") throw new TypeError(admittedSource.message);
  const transition = immutable({
    type: "ResearchQuestionStatusTransition",
    version: 1,
    from: state.status,
    to,
    reason: reason.trim(),
    source: admittedSource,
  });
  return eavtRow({ e: researchQuestionEntity(state.id), a: RESEARCH_QUESTION_STATUS_ATTRIBUTE, v: transition, t: at });
}

export function replayResearchQuestionEvents(events, { questionId } = {}) {
  if (!Array.isArray(events)) return refusal("INVALID_EVENTS", "events must be an array", "events");
  let state = null;
  let admittedQuestion = null;
  const history = [];
  for (let index = 0; index < events.length; index += 1) {
    let row;
    try { row = eavtRow(events[index]); } catch (error) { return refusal("INVALID_EAVT", error.message, `events[${index}]`); }
    const id = researchQuestionIdFromEntity(row.e);
    if (id === null || (questionId !== undefined && id !== questionId)) continue;
    if (row.a === RESEARCH_QUESTION_ADMITTED_ATTRIBUTE) {
      if (state !== null) return refusal("DUPLICATE_ADMISSION", `research question ${id} was admitted more than once`, `events[${index}]`);
      const value = row.v;
      if (!exact(value, ["type", "version", "id", "question", "source", "createdAt", "status"]) || value.type !== "ResearchQuestion" || value.version !== 1 || value.id !== id || value.status !== "open" || value.createdAt !== row.t) {
        return refusal("INVALID_ADMISSION_EVENT", "admission event must carry its matching admitted question and creation time", `events[${index}]`);
      }
      const admitted = admitResearchQuestion({ type: "ResearchQuestionCandidate", version: 1, id: value.id, question: value.question, source: value.source, createdAt: value.createdAt });
      if (admitted.type === "ResearchQuestionRefusal") return refusal("INVALID_ADMISSION_EVENT", admitted.message, `events[${index}]`);
      admittedQuestion = admitted;
      state = { type: "ResearchQuestionState", version: 1, id, question: admitted.question, source: admitted.source, createdAt: admitted.createdAt, status: "open", updatedAt: row.t };
      history.push(row);
      continue;
    }
    if (row.a === RESEARCH_QUESTION_STATUS_ATTRIBUTE) {
      if (state === null) return refusal("STATUS_BEFORE_ADMISSION", `research question ${id} has a status event before admission`, `events[${index}]`);
      const transition = row.v;
      if (!exact(transition, ["type", "version", "from", "to", "reason", "source"]) || transition.type !== "ResearchQuestionStatusTransition" || transition.version !== 1) {
        return refusal("INVALID_STATUS_EVENT", "status event must carry ResearchQuestionStatusTransition@1", `events[${index}]`);
      }
      if (typeof transition.reason !== "string" || transition.reason.trim() === "") return refusal("INVALID_STATUS_EVENT", "status transition reason must be nonempty text", `events[${index}]`);
      if (transition.from !== state.status || !TRANSITIONS[state.status]?.has(transition.to)) {
        return refusal("INVALID_STATUS_TRANSITION", `status transition ${transition.from} -> ${transition.to} does not follow current status ${state.status}`, `events[${index}]`);
      }
      if (!validInstant(row.t) || Date.parse(row.t) < Date.parse(state.updatedAt)) return refusal("NONMONOTONIC_TIME", "status event time precedes current state", `events[${index}]`);
      const transitionSource = admitSource(transition.source, `events[${index}].v.source`);
      if (transitionSource.type === "ResearchQuestionRefusal") return transitionSource;
      state = { ...state, status: transition.to, updatedAt: row.t };
      history.push(row);
    }
  }
  if (state === null) return refusal("QUESTION_NOT_FOUND", questionId === undefined ? "no research question admission was found" : `research question ${questionId} was not found`, "events");
  return immutable({ ...state, questionRecord: admittedQuestion, history });
}
