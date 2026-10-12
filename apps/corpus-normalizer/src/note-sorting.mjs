import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { splitMarkdownFrontmatterFence } from "@red-cup-engineering/markdown-engineering-services-section/split-markdown-frontmatter-fence";

const stopwords = new Set(`a about after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just may me might more most must my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves or via per use used using one two three new file files src test tests package packages service services section sections group red cup lib app apps code type types value values return readonly const function import export module modules implementation summary goal outcome notes note work working built build created changed current existing full first none only onto`.split(/\s+/u));

export function tokens(text) {
  const withoutFrontmatter = splitMarkdownFrontmatterFence(text)?.body ?? text;
  const found = withoutFrontmatter.replace(/```[\s\S]*?```/gu, " ").replace(/https?:\/\/\S+/gu, " ").toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/gu)?.map((word) => word.replace(/^-+|-+$/gu, "")) ?? [];
  return found.flatMap((word) => word.includes("-") ? [word, ...word.split("-")] : [word]).filter((word) => word.length > 2 && !stopwords.has(word) && !/^\d/u.test(word));
}

export async function noteFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const metadata = await stat(input);
    if (metadata.isFile()) files.push(path.resolve(input));
    else if (metadata.isDirectory()) for (const entry of await readdir(input, { withFileTypes: true })) if (entry.isFile() && /\.(?:md|markdown|org)$/iu.test(entry.name)) files.push(path.resolve(input, entry.name));
  }
  return [...new Set(files)].sort();
}

export async function keywordNotes(files, limit = 18) {
  const documents = await Promise.all(files.map(async (file) => ({ file, words: tokens(await readFile(file, "utf8")) })));
  const documentFrequency = new Map();
  for (const document of documents) for (const word of new Set(document.words)) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
  return documents.map((document) => {
    const frequency = new Map();
    for (const word of document.words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    const keywords = [...frequency].map(([word, count]) => ({ word, count, documents: documentFrequency.get(word), score: count * Math.log((documents.length + 1) / (documentFrequency.get(word) + 0.5)) }))
      .sort((left, right) => right.score - left.score || right.count - left.count || left.word.localeCompare(right.word)).slice(0, limit);
    return { path: document.file, keywords };
  });
}

async function walkSections(root, directory, sections) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ["apps", "content", "legacy", "node_modules", "test", "fixtures"].includes(entry.name)) continue;
    const child = path.join(directory, entry.name);
    if (entry.name.endsWith("-services-section")) sections.push({ root, path: child });
    await walkSections(root, child, sections);
  }
}

async function optionalText(file, maximum = 8192) { try { return (await readFile(file, "utf8")).slice(0, maximum); } catch (error) { if (error?.code === "ENOENT") return ""; throw error; } }

export async function serviceSections(roots) {
  const discovered = [];
  for (const root of roots.map((value) => path.resolve(value))) await walkSections(root, root, discovered);
  return Promise.all(discovered.map(async (section) => {
    let description = "";
    try { description = JSON.parse(await readFile(path.join(section.path, "package.json"), "utf8")).description ?? ""; } catch (error) { if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    const relative = path.relative(section.root, section.path);
    const nameWords = tokens(path.basename(section.path).replace(/-/gu, " "));
    const words = new Set([...tokens(relative.replace(/[\\/-]/gu, " ")), ...tokens(`${description} ${await optionalText(path.join(section.path, "README.md"))}`)]);
    return { path: section.path, nameWords, words };
  }));
}

export function matchSections(note, sections, limit = 5) {
  const noteWords = new Map(note.keywords.map((keyword, index) => [keyword.word, note.keywords.length - index]));
  return sections.map((section) => {
    const nameMatches = section.nameWords.filter((word) => noteWords.has(word));
    const proseMatches = [...section.words].filter((word) => noteWords.has(word));
    return { path: section.path, score: nameMatches.reduce((sum, word) => sum + noteWords.get(word) * 4, 0) + proseMatches.reduce((sum, word) => sum + noteWords.get(word), 0), words: [...new Set([...nameMatches, ...proseMatches])], nameMatchCount: nameMatches.length, proseMatchCount: proseMatches.length };
  }).filter((match) => match.nameMatchCount > 0 || match.proseMatchCount > 1).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path)).slice(0, limit);
}

export function noteDate(file) { const match = /(?:^|\/)(\d{4})-(\d{2})-(\d{2})-/u.exec(file.replace(/\\/gu, "/")); return match ? `${match[1]}/${match[2]}/${match[3]}` : ""; }

export function sortingTable(notes, sections) {
  const rows = ["source\tdate\tkeywords\tmatches\towner"];
  for (const note of notes) rows.push([note.path, noteDate(note.path), note.keywords.map(({ word }) => word).join(", "), matchSections(note, sections).map((match) => `${match.words.join("+")}:${match.path}`).join(" | "), ""].join("\t"));
  return `${rows.join("\n")}\n`;
}

export async function moveSortingTable(text) {
  const lines = text.trim().split(/\r?\n/u), header = lines.shift()?.split("\t");
  if (!header || !["source", "date", "keywords", "matches", "owner"].every((name, index) => header[index] === name)) throw new Error("sorting table has the wrong columns");
  let moved = 0;
  for (const line of lines) {
    const [source, date, , , owner] = line.split("\t");
    if (!owner) continue;
    if (!/^\d{4}\/\d{2}\/\d{2}$/u.test(date)) throw new Error(`missing YYYY/MM/DD date for ${source}`);
    const directory = path.join(owner, "content", "text", "documents", "articles", "notes", date), destination = path.join(directory, path.basename(source));
    try { await stat(destination); throw new Error(`destination exists: ${destination}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    await mkdir(directory, { recursive: true }); await rename(source, destination); moved += 1;
  }
  return moved;
}
