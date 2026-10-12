import {
  prepareTriageBatchUpload,
  prepareTriageUpload,
  type TriageUploadInput as UploadTriageFileInput,
} from "@emsenn/organizing-a-knowledge-vault/mutating";

import { emsennContentRoot } from "./content-root.mts";

export type { UploadTriageFileInput };

export type UploadTriageFileRequest = Readonly<{
  content: string;
}>;

export type UploadTriageFileResult = Readonly<{
  kind: "knowledge-vault.triage-file.upload";
  path: string;
  bytes: number;
  written: true;
}>;

export type UploadTriageFilesResult = Readonly<{
  kind: "knowledge-vault.triage-files.upload";
  files: readonly UploadTriageFileResult[];
  count: number;
  bytes: number;
  written: true;
}>;

export async function uploadTriageFile(
  request: UploadTriageFileRequest,
  now = new Date(),
  root?: string,
): Promise<UploadTriageFileResult> {
  const keys = Object.keys(request as Record<string, unknown>);
  const unexpected = keys.filter((key) => key !== "content");
  if (unexpected.length > 0) throw new Error(`unexpected triage upload fields: ${unexpected.join(", ")}`);
  const content = String(request.content ?? "");
  if (content.trim().length === 0) throw new Error("content is required");
  return siteUpload(prepareTriageUpload(emsennContentRoot(root), { content }, { now, write: true }));
}

export async function uploadTriageFiles(
  inputs: readonly UploadTriageFileInput[],
  now = new Date(),
  root?: string,
): Promise<UploadTriageFilesResult> {
  const uploaded = prepareTriageBatchUpload(emsennContentRoot(root), inputs, { now, write: true });
  return Object.freeze({
    kind: "knowledge-vault.triage-files.upload" as const,
    files: Object.freeze(uploaded.files.map(siteUpload)),
    count: uploaded.count,
    bytes: uploaded.bytes,
    written: true as const,
  });
}

function siteUpload(upload: Readonly<{ path: string; bytes: number; written: boolean }>): UploadTriageFileResult {
  if (upload.written !== true) throw new Error("triage upload was not written");
  return Object.freeze({
    kind: "knowledge-vault.triage-file.upload" as const,
    path: upload.path,
    bytes: upload.bytes,
    written: true as const,
  });
}
