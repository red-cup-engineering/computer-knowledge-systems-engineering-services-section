#!/usr/bin/env node
import { runCorpusBin } from "../src/knowledge-vault-web-server/script-runner.mts";

runCorpusBin(import.meta.url, "list-path");
