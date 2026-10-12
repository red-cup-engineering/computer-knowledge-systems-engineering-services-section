import { readFile } from "node:fs/promises";

export async function readJsonRequest(argument) {
  const text = argument === undefined || argument === null
    ? await new Promise((resolve, reject) => {
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => resolve(input));
      process.stdin.on("error", reject);
    })
    : await readFile(argument, "utf8");
  return JSON.parse(text);
}

export function writeJsonResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result?.type?.endsWith("Refusal") ? 1 : 0;
}
