#!/usr/bin/env node
import { runOrganizingVaultAdmissionBin } from "../src/knowledge-vault-web-server/script-runner.mts";

runOrganizingVaultAdmissionBin(import.meta.url, "document");
