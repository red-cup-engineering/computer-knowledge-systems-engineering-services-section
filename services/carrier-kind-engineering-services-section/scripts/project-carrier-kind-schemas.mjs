#!/usr/bin/env node
// usage: project-carrier-kind-schemas <science carriers schema directory> <this package's>
import { projectCarrierKindSchemas } from "../src/carrier-kind-schemas.mjs";
export { projectCarrierKindSchemas } from "../src/carrier-kind-schemas.mjs";
if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(`${JSON.stringify(await projectCarrierKindSchemas({ source: process.argv[2], destination: process.argv[3] }))}\n`);
