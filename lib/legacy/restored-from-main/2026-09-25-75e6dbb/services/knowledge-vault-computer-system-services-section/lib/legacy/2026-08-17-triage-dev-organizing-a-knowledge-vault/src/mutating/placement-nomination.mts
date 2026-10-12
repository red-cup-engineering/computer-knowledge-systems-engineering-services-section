export type PlacementNominationKind = "explanation" | "tutorial" | "guide" | "reference";

export type PlacementNomination = Readonly<{
  topic: string;
  kind: PlacementNominationKind;
  title: string;
  tags: readonly string[];
  summary: string;
}>;

export type NominationPrompt = Readonly<{
  system: string;
  user: string;
}>;

export type NominationPromptInput = Readonly<{
  title: string;
  text: string;
  topics: readonly string[];
}>;

const DIATAXIS_KINDS = new Set<PlacementNominationKind>([
  "explanation",
  "tutorial",
  "guide",
  "reference",
]);

const NOMINATION_TEXT_BUDGET = 8_000;
const MAX_TAGS = 6;

export function buildNominationPrompt(input: NominationPromptInput): NominationPrompt {
  const topicList = input.topics.length > 0 ? input.topics.join("\n") : "(the content tree is currently empty)";
  return Object.freeze({
    system: [
      "You are a knowledge-vault corpus placement classifier.",
      "You place a document at its finest taxonomical location under the vault's content/ topic tree and nominate the tags it asserts about itself.",
      "A topic path is a claim about what the material is about, read deepest-first: prefer the most specific existing branch, and only extend it with a new, narrower segment when the document genuinely warrants one.",
      "Classification facets (UDC/LCC/subject codes) and key topics are tags, not folders.",
      "Answer as plain labeled lines exactly as instructed -- no JSON, no code fence, no extra commentary.",
    ].join(" "),
    user: [
      "Existing content/ topic paths (place within one of these, or just beneath one; deeper is better when the text justifies it):",
      "",
      topicList,
      "",
      `Document title: ${input.title.trim().length > 0 ? input.title.trim() : "(untitled)"}`,
      "",
      "Document text (excerpt):",
      input.text.slice(0, NOMINATION_TEXT_BUDGET),
      "",
      "Reply with exactly these five lines, each starting with the label and a colon:",
      "TOPIC: a content-relative path of lowercase kebab-case segments separated by '/', no leading 'content/'",
      "KIND: one word -- explanation, tutorial, guide, or reference",
      "TITLE: a concise human title",
      "TAGS: 2 to 6 kebab-case terms separated by commas, naming key topics actually in the text (not restatements of the path)",
      "SUMMARY: one sentence",
    ].join("\n"),
  });
}

export function parseNominationResponse(text: string): PlacementNomination {
  const topic = normalizeTopicPath(labelValue(text, "topic"));
  if (topic.length < 2) throw new Error("nomination did not include a usable topic path");
  const kindRaw = labelValue(text, "kind").toLowerCase().replace(/[^a-z]/g, "") as PlacementNominationKind;
  const kind = DIATAXIS_KINDS.has(kindRaw) ? kindRaw : "explanation";
  const title = labelValue(text, "title");
  const tags = tagList(labelValue(text, "tags"));
  const summary = labelValue(text, "summary");
  return Object.freeze({ topic, kind, title, tags, summary });
}

export function normalizeTopicPath(value: string): string {
  return value
    .replace(/^\/+|\/+$/g, "")
    .replace(/^content\//i, "")
    .split("/")
    .map(slugSegment)
    .filter((segment) => segment.length > 0)
    .join("/");
}

function labelValue(text: string, label: string): string {
  const pattern = new RegExp(`^[\\s>*-]*\\*{0,2}${label}\\*{0,2}\\s*[:\\-]\\s*(.+)$`, "im");
  const match = pattern.exec(text);
  return match ? (match[1] ?? "").replace(/\*+/g, "").trim() : "";
}

function slugSegment(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tagList(value: string): readonly string[] {
  const slugs: string[] = [];
  for (const entry of value.split(/[,;\n|]+| and /i)) {
    const slug = slugSegment(entry);
    if (slug.length > 0 && !slugs.includes(slug)) slugs.push(slug);
    if (slugs.length >= MAX_TAGS) break;
  }
  return Object.freeze(slugs);
}
