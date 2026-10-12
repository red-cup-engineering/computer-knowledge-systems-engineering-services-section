#!/usr/bin/env node
import { readKnowledgeVaultDocument } from "../src/organizing-with-a-knowledge-vault/index.mts";
import { runJsonOperation } from "../src/knowledge-vault-web-server/script-runner.mts";

runJsonOperation(import.meta.url, readKnowledgeVaultDocument);
