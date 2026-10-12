#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const scripts = readdirSync(new URL(".", import.meta.url))
  .filter((name) => name.endsWith(".mjs") && name !== "check-scripts.mjs")
  .sort();

for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--check", join("scripts", script)], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
