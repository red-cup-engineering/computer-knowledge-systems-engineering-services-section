

import { dataArtifactDescriptor, dataDatePartition, dataTierDirectory } from "@red-cup-engineering/computer-system-engine/addressing/data-artifact-address";
import {
  staticWebsiteContentArtifactContract,
  staticWebsiteContentManifestContract,
  staticWebsiteContentManifestReadContract,
  staticWebsiteContentProjectionContract,

} from "./schema.mjs";
import { projectionSegmentKey } from "@red-cup-engineering/feltos/content/segment-key";

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function posixJoin(...parts) {
  const absolute = parts[0]?.startsWith("/") === true;
  const joined = parts.map(trimSlashes).filter(Boolean).join("/");
  return absolute ? `/${joined}` : joined;
}

function pathBasename(value) {
  return value.replace(/\\/gu, "/").split("/").filter(Boolean).at(-1) ?? "";
}

function rootNameOf(root, explicit) {
  if (explicit !== undefined && explicit.trim().length > 0) return projectionSegmentKey(explicit.replace(/^@/u, ""), "static-website");
  return projectionSegmentKey(pathBasename(root) || "root", "root");
}

/** Boundary coordinates for a static-website content address. */

/** The stable `content` address for one static-website file-map materialization. */
export function staticWebsiteContentAddress(
  root,
  options = {},
) {
  if (options.at === undefined) {
    throw new TypeError("staticWebsiteContentAddress: options.at is required; host clocks belong to @red-cup-engineering/node-process-services-section");
  }
  const at = String(options.at);
  const partition = dataDatePartition(at);
  const action = projectionSegmentKey(options.action ?? "static-website", "static-website");
  const subject = projectionSegmentKey(options.subject ?? "website", "website");
  const rootName = rootNameOf(root, options.rootName);
  const directory = posixJoin(dataTierDirectory(root, "content", at), `${partition.date}-${rootName}-${action}-${subject}-content`);
  return Object.freeze({
    date: partition.date,
    rootName,
    action,
    subject,
    directory,
    manifestPath: posixJoin(directory, `${partition.date}-${rootName}-${action}-${subject}-manifest.json`),
  });
}

/** Normalize and constrain one static-website output path before it meets the filesystem. */
export function safeStaticWebsiteOutputPath(value) {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+/u, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) throw new TypeError("safeStaticWebsiteOutputPath: output path must not be empty");
  if (parts.some((part) => part === "." || part === ".." || part.includes("\u0000"))) {
    throw new TypeError(`safeStaticWebsiteOutputPath: unsafe output path ${value}`);
  }
  return parts.join("/");
}

export function staticWebsiteOutputPath(directory, outputPath) {
  return posixJoin(directory, safeStaticWebsiteOutputPath(outputPath));
}

export function staticWebsiteOutputEncoding(outputPath) {
  const basename = outputPath.split("/").at(-1) ?? "";
  const match = /\.([A-Za-z0-9._-]+)$/u.exec(basename);
  return match?.[1] ?? "bin";
}

export function staticWebsiteOutputArtifact(pathname, outputPath) {
  return dataArtifactDescriptor("content", pathname, staticWebsiteOutputEncoding(outputPath));
}

export function staticWebsiteContentArtifact(value) {
  return staticWebsiteContentArtifactContract.assert(
    Object.freeze({ ...value, artifact: Object.freeze(value.artifact) }),
    "static-website content artifact",
  );
}

export function staticWebsiteContentManifest(value) {
  return staticWebsiteContentManifestContract.assert(
    Object.freeze({ ...value, files: Object.freeze([...value.files]) }),
    "static-website content manifest",
  );
}

export function staticWebsiteContentProjection(value) {
  return staticWebsiteContentProjectionContract.assert(
    Object.freeze({
      ...value,
      artifacts: Object.freeze([...value.artifacts]),
      paths: Object.freeze([...value.paths]),
    }),
    "static-website content projection",
  );
}

export function staticWebsiteContentManifestRead(value) {
  return staticWebsiteContentManifestReadContract.assert(
    Object.freeze(value),
    "static-website content manifest read",
  );
}
