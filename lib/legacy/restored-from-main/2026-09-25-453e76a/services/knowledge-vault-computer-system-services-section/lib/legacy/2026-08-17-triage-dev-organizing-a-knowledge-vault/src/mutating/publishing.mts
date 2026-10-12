/**
 * mutating/publishing  -  dry-run-first static-site publication routes.
 *
 * The vault package owns the route from corpus evidence to publication intent.
 * Downstream sites own their renderer, while Obsidian and agents can actuate
 * this plan once the human has reviewed the commands.
 */
import path from "node:path";
import type { StaticSitePublishPlan } from "./carriers.mjs";

export interface StaticSitePublishPlanInput {
  readonly site?: string;
  readonly baseUrl?: string;
  readonly siteRoot?: string;
  readonly outDir?: string;
  readonly branch?: string;
  readonly buildCommand?: string;
  readonly commitMessage?: string;
  readonly artifactPaths?: readonly string[];
}

const DEFAULT_SITE = "knowledge-vault-static-site";
const DEFAULT_BASE_URL = "https://example.com";
const DEFAULT_SITE_ROOT = ".";
const DEFAULT_OUT_DIR = "build";
const DEFAULT_BRANCH = "main";
const DEFAULT_BUILD_COMMAND = "pnpm run build";

export function planStaticSitePublication(root: string, input: StaticSitePublishPlanInput = {}): StaticSitePublishPlan {
  const site = nonempty(input.site, DEFAULT_SITE);
  const baseUrl = nonempty(input.baseUrl, DEFAULT_BASE_URL);
  const siteRoot = normalizeRoot(input.siteRoot, DEFAULT_SITE_ROOT);
  const outDir = cleanPath(nonempty(input.outDir, DEFAULT_OUT_DIR));
  const branch = nonempty(input.branch, DEFAULT_BRANCH);
  const buildCommand = nonempty(input.buildCommand, DEFAULT_BUILD_COMMAND);
  const commitMessage = nonempty(input.commitMessage, `Publish ${site} from knowledge vault`);
  const artifactPaths = input.artifactPaths?.map(cleanPath).filter((value) => value.length > 0)
    ?? [`${outDir}/`, `${outDir}/index.html`, `${outDir}/map.json`, `${outDir}/map-health.json`, `${outDir}/CNAME`, `${outDir}/.nojekyll`];

  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.static-site-publish-plan" as const,
    root,
    site,
    baseUrl,
    siteRoot,
    outDir,
    branch,
    commitMessage,
    dryRun: true,
    artifactPaths: Object.freeze(artifactPaths),
    steps: Object.freeze([
      Object.freeze({
        label: "inspect",
        purpose: "Confirm the downstream site repository is clean enough to publish.",
        commands: Object.freeze([
          command(siteRoot, "status", "git status --short"),
          command(siteRoot, "branch", "git branch --show-current"),
        ]),
      }),
      Object.freeze({
        label: "build",
        purpose: "Render the vault projection into a directory of static HTML resources.",
        commands: Object.freeze([
          command(siteRoot, "build", buildCommand),
        ]),
      }),
      Object.freeze({
        label: "commit",
        purpose: "Commit the site source/configuration changes that induce the static build.",
        commands: Object.freeze([
          command(siteRoot, "stage", "git add ."),
          command(siteRoot, "commit", `git commit -m ${shellValue(commitMessage)}`),
        ]),
      }),
      Object.freeze({
        label: "push",
        purpose: "Push the publication branch so GitHub Pages can deploy from the repository configuration.",
        commands: Object.freeze([
          command(siteRoot, "push", `git push origin ${branch}`),
        ]),
      }),
    ]),
  });
}

function command(cwd: string, label: string, value: string) {
  return Object.freeze({ label, cwd, command: value });
}

function nonempty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? fallback : trimmed;
}

function normalizeRoot(value: string | undefined, fallback: string): string {
  const chosen = nonempty(value, fallback);
  return path.normalize(chosen);
}

function cleanPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function shellValue(value: string): string {
  return JSON.stringify(value);
}
