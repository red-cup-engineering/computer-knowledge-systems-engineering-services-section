#!/usr/bin/env node
import { runTripleStoreBin } from "../src/knowledge-vault-web-server/script-runner.mts";

runTripleStoreBin(import.meta.url, "read-facts");
