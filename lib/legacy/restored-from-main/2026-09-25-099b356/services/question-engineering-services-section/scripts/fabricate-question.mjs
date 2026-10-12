import { fabricateResearchQuestionDocument } from "../src/question-document.mjs";

export async function fabricateQuestion(request) {
  return fabricateResearchQuestionDocument(request);
}
