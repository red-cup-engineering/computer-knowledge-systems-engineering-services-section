import path from "node:path";
import { eavtRow as asEntry } from "@red-cup-engineering/eavt/admit-row";
import { sameEavtRows as sameEntry } from "@red-cup-engineering/eavt/same-eavt-rows";
import { appendEavtEntries } from "@red-cup-engineering/eavt/append-eavt-entries";
import { journalPath as logPathFor } from "@red-cup-engineering/eavt/journal-path";
import { readEavtJournal } from "@red-cup-engineering/eavt/read-eavt-journal";
import {
  RESEARCH_QUESTION_ADMITTED_ATTRIBUTE,
  RESEARCH_QUESTION_STATUS_ATTRIBUTE,
  replayResearchQuestionEvents,
  researchQuestionIdFromEntity,
} from "./question.mjs";

export const SCIENCE_QUESTIONS_FEED = "science-questions";
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function refusal(code, message, path = null) {
  return immutable({ type: "ResearchQuestionJournalRefusal", version: 1, code, message, path });
}

// Confine relativePath under rootDirectory, refusing any escape -- inlined
// from the retired eavt-witness-journal-file-service (superseded by
// witness-journal-log-service's logPathFor for the journal path itself;
// this generic confinement check is the one piece of that package's surface
// still load-bearing here).
function confinedJournalPath(rootDirectory, relativePath) {
  const root = path.resolve(rootDirectory);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new TypeError(`journal path escapes rootDirectory: ${relativePath}`);
  }
  return resolved;
}

export function researchQuestionJournalAddress({ root, at }) {
  if (typeof root !== "string" || root.trim() === "") throw new TypeError("root must be nonempty text");
  const filePath = logPathFor({root: path.resolve(root), feed: SCIENCE_QUESTIONS_FEED, at});
  const relativePath = path.relative(path.resolve(root), filePath);
  const confinedPath = confinedJournalPath(root, relativePath);
  if (confinedPath !== filePath) throw new Error("witness-journal services disagree on the question journal address");
  return immutable({ filePath, relativePath });
}

export function readResearchQuestionEvents({ root, dates, questionId }) {
  if (!Array.isArray(dates) || dates.some((date) => typeof date !== "string" || !DATE.test(date))) throw new TypeError("dates must be YYYY-MM-DD strings");
  const events = [];
  for (const date of [...new Set(dates)].sort()) {
    for (const { entry, trace } of readEavtJournal({root, feed: SCIENCE_QUESTIONS_FEED, at: date})) {
      const row = asEntry(entry);
      const id = researchQuestionIdFromEntity(row.e);
      if (id === null || (questionId !== undefined && id !== questionId)) continue;
      if (![RESEARCH_QUESTION_ADMITTED_ATTRIBUTE, RESEARCH_QUESTION_STATUS_ATTRIBUTE].includes(row.a)) continue;
      events.push(immutable({ ...row, journalDate: date, trace }));
    }
  }
  return Object.freeze(events);
}

export function readResearchQuestionState({ root, dates, questionId }) {
  if (typeof questionId !== "string" || questionId === "") throw new TypeError("questionId must be nonempty text");
  const events = readResearchQuestionEvents({ root, dates, questionId });
  return replayResearchQuestionEvents(events, { questionId });
}

export function appendResearchQuestionEvent({ root, event, historyDates = [] }) {
  let row;
  try { row = asEntry(event); } catch (error) { return refusal("INVALID_EAVT", error.message, "event"); }
  const questionId = researchQuestionIdFromEntity(row.e);
  if (questionId === null || ![RESEARCH_QUESTION_ADMITTED_ATTRIBUTE, RESEARCH_QUESTION_STATUS_ATTRIBUTE].includes(row.a)) {
    return refusal("NOT_A_RESEARCH_QUESTION_EVENT", "event must be a question admission or status-transition EAVT row", "event");
  }
  const eventDate = typeof row.t === "string" ? row.t.slice(0, 10) : "";
  if (!DATE.test(eventDate)) return refusal("INVALID_EVENT_TIME", "event time must identify a UTC calendar day", "event.t");
  const dates = [...new Set([...historyDates, eventDate])].sort();
  const history = readResearchQuestionEvents({ root, dates, questionId }).map(({ e, a, v, t }) => ({ e, a, v, t }));
  const repeated = history.some((present) => sameEntry({left: present, right: row}));
  const assay = replayResearchQuestionEvents(repeated ? history : [...history, row], { questionId });
  if (assay.type === "ResearchQuestionRefusal") return refusal(assay.code, assay.message, assay.path);
  const result = appendEavtEntries({root, feed: SCIENCE_QUESTIONS_FEED, entries: [row], at: row.t});
  const address = researchQuestionJournalAddress({ root, at: row.t });
  return immutable({ type: "ResearchQuestionEventAppendReceipt", version: 1, questionId, appended: result.appended, address, state: assay });
}
