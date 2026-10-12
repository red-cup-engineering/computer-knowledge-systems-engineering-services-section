import path from "node:path";

const typedRoots = new Map([
  ["content/text/glossary/terms", "glossary-terms-root"],
  ["content/text/triage", "text-triage-root"],
  ["content/text/documents/articles/notes", "notes-root"]
]);

const generatedNames = new Set([
  "node_modules", "dist", "build", "coverage", ".git", ".venv", "venv", "__pycache__", ".pytest_cache",
  ".mypy_cache", ".ruff_cache", ".hypothesis", ".ipynb_checkpoints"
]);

export function detectRepresentation(entry) {
  const base = path.basename(entry.relativePath);
  const normalized = entry.relativePath.split(path.sep).join("/");
  if (entry.type === "directory" && generatedNames.has(base)) return "generated-directory";
  if (entry.type === "directory" && base.endsWith("-services-section")) return "service-section";
  if (entry.type === "directory" && typedRoots.has(normalized)) return typedRoots.get(normalized);
  if (entry.type === "file" && base === "package.json") return "package-manifest";
  if (entry.type === "file" && base === "pyproject.toml") return "python-project-manifest";
  if (entry.type === "file" && base === "Cargo.toml") return "rust-project-manifest";
  if (entry.type === "file" && base === "go.mod") return "go-project-manifest";
  if (entry.type === "file" && /\.ipynb$/i.test(base)) return "notebook";
  if (entry.type === "file" && /\.bib$/i.test(base)) return "bibliography";
  if (entry.type === "file" && /\.(?:tgz|tar\.gz|tar|zip)$/i.test(base)) return "archive";
  if (entry.type === "symlink") return "symlink";
  if (entry.type === "file" && /\.(?:md|mdx|org|txt|rst|html|tex)$/i.test(base)) return "text";
  return entry.type;
}

export function boundaryKinds(entry, representation) {
  const kinds = [];
  if (["service-section", "glossary-terms-root", "text-triage-root", "notes-root"].includes(representation)) kinds.push(representation);
  if (["package-manifest", "python-project-manifest", "rust-project-manifest", "go-project-manifest"].includes(representation)) kinds.push("package");
  if (representation === "notebook") kinds.push("notebook");
  if (representation === "bibliography") kinds.push("bibliography");
  if (representation === "archive") kinds.push("archive");
  return kinds;
}

export function isGenerated(relativePath) {
  return relativePath.split(path.sep).some((part) => generatedNames.has(part));
}
