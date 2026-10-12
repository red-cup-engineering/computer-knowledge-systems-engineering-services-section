import { openArchive } from "@red-cup-engineering/knowledge-system-server/archive";
import { CairnRevisionConflict, projectCairnSnapshot } from "@red-cup-engineering/knowledge-system-server/markdown-vault";
import { renderMarkdownBlockHtml } from "@red-cup-engineering/markdown-engineering-services-section/render-markdown-block-html";

export const GeodeRevisionConflict = CairnRevisionConflict;
/** GEODE's workspace projection is CAIRN's snapshot projection. */
export const projectGeodeWorkspace = projectCairnSnapshot;

/**
 * GEODE's workspace: a CAIRN archive, with documents read for display (their body rendered to
 * HTML). Everything else -- reading, navigating, revising, and what the documents say -- is the
 * archive's own.
 */
export async function createGeodeWorkspace(options = {}) {
  const archive = await openArchive(options);
  const displayed = (reading) => Object.freeze({ ...reading, html: renderMarkdownBlockHtml(reading.body) });
  const own = Object.fromEntries(Object.entries(archive).filter(([key]) => !["snapshot", "paths", "version", "type"].includes(key)));
  return Object.freeze({
    ...own,
    type: "GeodeWorkspace",
    archive,
    get snapshot() { return archive.snapshot; },
    get paths() { return archive.paths; },
    get version() { return archive.version; },
    async read(path) { return displayed(await archive.read(path)); },
    async replace(options) {
      const receipt = await archive.replace(options);
      return Object.freeze({ ...receipt, document: displayed(receipt.document) });
    },
  });
}
