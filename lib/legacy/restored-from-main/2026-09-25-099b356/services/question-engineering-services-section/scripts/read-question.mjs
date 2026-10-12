import { readResearchQuestionState } from "../src/question-journal.mjs";

export function readQuestion(request) {
  return readResearchQuestionState(request);
}
