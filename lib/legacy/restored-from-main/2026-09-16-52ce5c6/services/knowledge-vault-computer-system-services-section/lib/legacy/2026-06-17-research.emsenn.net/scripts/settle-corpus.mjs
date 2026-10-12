#!/usr/bin/env node
import { runOrganizingVaultBin } from "../src/knowledge-vault-web-server/script-runner.mts";

runOrganizingVaultBin(import.meta.url, "settle-memory");
