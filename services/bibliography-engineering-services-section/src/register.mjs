/**
 * @module register
 * A bibliographic register as data: `{ query, item }`, where `query` is a
 * JSON API query (http-services-section) and `item` the CSL projection
 * (csl-json-services-section) of one of its results. Searching a register is
 * running its query and projecting each result; a register is added by
 * writing that pair, not a client.
 */

import { projectCslItem } from "@red-cup-engineering/csl-json-services-section/projection";
import { queryJsonApi } from "@red-cup-engineering/http-services-section/json-api-query";

/**
 * @param {{ query: object, item: object }} register
 * @param {Record<string, string|number>} variables - the query's template variables for this search
 * @param {object} [options] - forwarded to the fetch (timeoutMs, signal, ...)
 * @returns {Promise<{ uri: string, count: (number|undefined), items: object[] }>} CSL-JSON items
 */
export async function searchRegister(register, variables, options = {}) {
  if (!register || typeof register !== "object" || !register.query || !register.item) {
    throw new TypeError("searchRegister requires a register { query, item }");
  }
  const { uri, count, results } = await queryJsonApi(register.query, variables, options);
  return Object.freeze({ uri, count, items: Object.freeze(results.map((result) => projectCslItem(result, register.item))) });
}
