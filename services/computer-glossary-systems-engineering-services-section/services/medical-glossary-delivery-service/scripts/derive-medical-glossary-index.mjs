#!/usr/bin/env node
import { readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { writeFileText } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";
import { isMain } from "@red-cup-engineering/javascript-file-services-section/javascript-file-main-guard";
import { fileURLToPath as projectFileUrlFilepath } from "node:url";
import { findGlossaryTermMarkdownPaths, projectGlossaryIndex } from "@red-cup-engineering/term-engineering-services-section/glossary-index";

/** The scientific source corpus, walked and read from; never the projected `root` label. */
const SECTION_DIRECTORY = projectFileUrlFilepath(new URL("../../../../../../../../../../../../science-services-section/services/natural-science-services-section/services/biological-science-services-section/services/medical-science-services-section", import.meta.url).href).replace(/\/$/u, "");
/** This section's repo-relative path: the `root` label the index records, so the committed JSON (it ships in the published tarball) never carries this machine's absolute filesystem path. */
const SECTION_REPO_RELATIVE_PATH = "lib/emsenn/services/561-group/services/science-services-section/services/natural-science-services-section/services/biological-science-services-section/services/medical-science-services-section";
const OUT_PATH = projectFileUrlFilepath(new URL("../data/records/glossary-index-records/glossary-index.json", import.meta.url).href);

/**
 * Derive the medical glossary index: the term owner's projection, walked and read from this
 * section's own tree, written to `data/records/glossary-index-records/glossary-index.json`. This section carries no
 * glossary logic of its own; every recognition and projection rule comes from the term owner.
 * @param {{walkRoot?: string, root?: string, out?: string}} [options] `walkRoot` is the real
 *   filesystem directory to walk; `root` is the repo-relative label the projected index records.
 * @returns {Promise<{root: string, out: string, index: ReturnType<typeof projectGlossaryIndex>}>}
 */
export async function deriveMedicalGlossaryIndex({ walkRoot = SECTION_DIRECTORY, root = SECTION_REPO_RELATIVE_PATH, out = OUT_PATH } = {}) {
  const paths = findGlossaryTermMarkdownPaths(walkRoot);
  const documents = [];
  for (const path of paths) {
    const text = await readFileText(path);
    const relativePath = path.startsWith(`${walkRoot}/`) ? path.slice(walkRoot.length + 1) : path;
    documents.push({ path: relativePath, filename: relativePath.split("/").pop(), text });
  }
  const index = projectGlossaryIndex({ root, documents });
  await writeFileText(out, `${JSON.stringify(index, null, 2)}\n`);
  return { root, out, index };
}

if (isMain(import.meta.url)) {
  const { out, index } = await deriveMedicalGlossaryIndex();
  process.stdout.write(`records: ${index.records.length}  refused: ${index.refused.length}\nwrote: ${out}\n`);
}
