#!/usr/bin/env node
import { runBoundaryBin } from "../src/knowledge-vault-web-server/script-runner.mts";

runBoundaryBin(import.meta.url, "knowledge_vault_normalization_plan");
