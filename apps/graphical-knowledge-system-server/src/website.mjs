import { createVictorWebsite } from "@red-cup-engineering/static-site-publisher/website";
import { createGeodeVictorApplicationFactory } from "./server.mjs";

const EMPTY_READER = Object.freeze({
  async listRecords() { return Object.freeze([]); },
  async readRecord() { throw new RangeError("Geode's VICTOR shell has no publication records"); },
});

/**
 * Form the Geode website through VICTOR without asking VICTOR to reinterpret
 * arbitrary admitted vault notes as publication cells.
 */
export async function createGeodeWebsite({ workspace, publicDirectory, victor = {} } = {}) {
  if (!workspace || typeof workspace.read !== "function") throw new TypeError("workspace is required");
  if (!victor || typeof victor !== "object" || Array.isArray(victor)) throw new TypeError("victor options must be an object");
  for (const owned of ["reader", "contentDir", "applications"]) {
    if (owned in victor) throw new TypeError(`Geode owns the VICTOR ${owned} option`);
  }
  return createVictorWebsite({
    ...victor,
    reader: EMPTY_READER,
    applications: createGeodeVictorApplicationFactory({ workspace, publicDirectory }),
  });
}
