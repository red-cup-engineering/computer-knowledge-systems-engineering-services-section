#!/usr/bin/env node
import { readJsonRequest, writeJsonResult } from "../src/cli.mjs";
import { admitQuestion } from "../scripts/admit-question.mjs";
import { admitSetOfQuestions } from "../scripts/admit-set-of-questions.mjs";
import { appendQuestion } from "../scripts/append-question.mjs";
import { fabricateQuestion } from "../scripts/fabricate-question.mjs";
import { readQuestion } from "../scripts/read-question.mjs";

const operations = new Map([
  ["admit", admitQuestion],
  ["admit-set", admitSetOfQuestions],
  ["append", appendQuestion],
  ["read", readQuestion],
  ["fabricate", fabricateQuestion],
]);
const operationName = process.argv[2];
const operation = operations.get(operationName);
if (operation === undefined) {
  process.stderr.write("usage: question <admit|admit-set|append|read|fabricate> [request.json]\n");
  process.exitCode = 2;
} else {
  const result = await operation(await readJsonRequest(process.argv[3]));
  process.exitCode = writeJsonResult(result);
}
