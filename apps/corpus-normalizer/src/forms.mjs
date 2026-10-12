import { proposeTerm, validateTerm } from "./term.mjs";
import { proposeTriageText, validateTriageText } from "./triage-text.mjs";
import { proposeNote, validateNote } from "./note.mjs";
import { proposeReferenceSource, validateReferenceSource } from "./reference-source.mjs";
import * as application from "./application.mjs";
import * as serviceSection from "./service-section.mjs";

export const forms = {
  term: { propose: proposeTerm, validate: validateTerm },
  "triage-text": { propose: proposeTriageText, validate: validateTriageText },
  note: { propose: proposeNote, validate: validateNote }, application, "service-section": serviceSection,
  "reference-source": { propose: proposeReferenceSource, validate: validateReferenceSource }
};
export const formFor = (name) => forms[name] ?? null;
