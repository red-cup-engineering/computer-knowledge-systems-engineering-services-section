import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function run(operation, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../apps/question-cli.mjs", import.meta.url).pathname, operation], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify(request));
  });
}

test("admission CLI exposes success and typed refusal exit status", async () => {
  const request = {
    type: "ResearchQuestionCandidate",
    version: 1,
    id: "observable-interface",
    question: "Which interface is observable?",
    source: { type: "ResearchQuestionSource", version: 1, locator: "vault://interface", digest: `sha256:${"c".repeat(64)}` },
    createdAt: "2026-08-31T18:00:00Z",
  };
  const accepted = await run("admit", request);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).type, "ResearchQuestion");

  const refused = await run("admit", { ...request, id: "NOT LAWFUL" });
  assert.equal(refused.status, 1, refused.stderr);
  assert.equal(JSON.parse(refused.stdout).type, "ResearchQuestionRefusal");
});
