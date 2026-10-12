import { createVictorWebsite } from "@red-cup-engineering/victor";
import { createOpalVictorApplicationFactory } from "./server.mjs";

const EMPTY_READER = Object.freeze({
  async listRecords() { return Object.freeze([]); },
  async readRecord() { throw new RangeError("Opal's VICTOR shell has no publication records"); },
});

/**
 * Form the Opal website through VICTOR without asking VICTOR to reinterpret
 * arbitrary admitted vault notes as publication cells.
 */
export async function createOpalWebsite({ workspace, publicDirectory, victor = {} } = {}) {
  if (!workspace || typeof workspace.read !== "function") throw new TypeError("workspace is required");
  if (!victor || typeof victor !== "object" || Array.isArray(victor)) throw new TypeError("victor options must be an object");
  for (const owned of ["reader", "contentDir", "applications"]) {
    if (owned in victor) throw new TypeError(`Opal owns the VICTOR ${owned} option`);
  }
  return createVictorWebsite({
    ...victor,
    reader: EMPTY_READER,
    applications: createOpalVictorApplicationFactory({ workspace, publicDirectory }),
  });
}

export const createGeodeWebsite = createOpalWebsite;
