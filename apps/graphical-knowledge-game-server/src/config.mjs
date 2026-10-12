const DIALECTS = new Set(["house", "obsidian", "org"]);
const VISIBILITIES = new Set(["public", "authenticated", "private"]);
const PARTICIPATION_MODES = new Set(["disabled", "vaultmaze"]);

function nonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function stringArray(value, path) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${path} must be an array of strings`);
  }
  return [...value];
}

/**
 * Validate the declarative seam between a reusable vault application and one
 * situated vault. Secrets are intentionally absent: deployments supply OAuth
 * client secrets through their runtime, never through a corpus configuration.
 */
export function validateVaultMazeConfig(offered) {
  if (offered === null || typeof offered !== "object" || Array.isArray(offered)) {
    throw new TypeError("VaultMaze config must be an object");
  }
  if (offered.schemaVersion !== "vaultmaze-config/v1") {
    throw new TypeError('schemaVersion must be "vaultmaze-config/v1"');
  }
  const id = nonEmptyString(offered.id, "id");
  const title = nonEmptyString(offered.title, "title");
  if (!Array.isArray(offered.wings) || offered.wings.length === 0) {
    throw new TypeError("wings must be a non-empty array");
  }

  const wingIds = new Set();
  const wings = offered.wings.map((wing, index) => {
    const path = `wings[${index}]`;
    if (wing === null || typeof wing !== "object" || Array.isArray(wing)) {
      throw new TypeError(`${path} must be an object`);
    }
    const wingId = nonEmptyString(wing.id, `${path}.id`);
    if (wingIds.has(wingId)) throw new TypeError(`duplicate wing id: ${wingId}`);
    wingIds.add(wingId);
    const dialect = wing.dialect ?? "house";
    if (!DIALECTS.has(dialect)) throw new TypeError(`${path}.dialect is unsupported`);
    const visibility = wing.visibility ?? "authenticated";
    if (!VISIBILITIES.has(visibility)) {
      throw new TypeError(`${path}.visibility is unsupported`);
    }
    const tufte = wing.tufte ?? { strategy: "tiling-grid", columns: 64 };
    if (tufte === null || typeof tufte !== "object" || Array.isArray(tufte)) {
      throw new TypeError(`${path}.tufte must be an object`);
    }
    if (tufte.strategy !== "tiling-grid" && tufte.strategy !== "force-directed") {
      throw new TypeError(`${path}.tufte.strategy is unsupported`);
    }
    const columns = tufte.columns ?? 64;
    if (!Number.isSafeInteger(columns) || columns < 1 || columns > 4096) {
      throw new TypeError(`${path}.tufte.columns must be an integer from 1 through 4096`);
    }
    return Object.freeze({
      id: wingId,
      root: nonEmptyString(wing.root, `${path}.root`),
      dialect,
      visibility,
      excludeGlobs: stringArray(wing.excludeGlobs ?? [], `${path}.excludeGlobs`),
      attributeFields: stringArray(
        wing.attributeFields ?? ["cites", "type", "tags", "science-owner"],
        `${path}.attributeFields`,
      ),
      tufte: Object.freeze({ strategy: tufte.strategy, columns }),
    });
  });

  const auth = offered.auth ?? { mode: "disabled" };
  if (auth === null || typeof auth !== "object" || Array.isArray(auth)) {
    throw new TypeError("auth must be an object");
  }
  if (auth.mode !== "disabled" && auth.mode !== "oauth" && auth.mode !== "identity-proxy") {
    throw new TypeError('auth.mode must be "disabled", "oauth", or "identity-proxy"');
  }
  if (auth.mode === "oauth" && auth.issuer === undefined && auth.issuerEnvironmentVariable === undefined) {
    throw new TypeError("OAuth auth requires issuer or issuerEnvironmentVariable");
  }
  const normalizedAuth = auth.mode === "oauth"
    ? Object.freeze({
        mode: "oauth",
        issuer: auth.issuer === undefined ? null : nonEmptyString(auth.issuer, "auth.issuer"),
        issuerEnvironmentVariable: auth.issuerEnvironmentVariable === undefined
          ? null
          : nonEmptyString(auth.issuerEnvironmentVariable, "auth.issuerEnvironmentVariable"),
        clientIdEnvironmentVariable: nonEmptyString(
          auth.clientIdEnvironmentVariable,
          "auth.clientIdEnvironmentVariable",
        ),
        clientSecretEnvironmentVariable: nonEmptyString(
          auth.clientSecretEnvironmentVariable,
          "auth.clientSecretEnvironmentVariable",
        ),
        callbackPath: nonEmptyString(auth.callbackPath ?? "/oauth/callback", "auth.callbackPath"),
        scopes: stringArray(auth.scopes ?? ["openid", "profile", "email"], "auth.scopes"),
      })
    : auth.mode === "identity-proxy"
      ? Object.freeze({
          mode: "identity-proxy",
          provider: nonEmptyString(auth.provider, "auth.provider"),
          identityContext: nonEmptyString(auth.identityContext, "auth.identityContext"),
        })
      : Object.freeze({ mode: "disabled" });

  const participation = offered.participation ?? { mode: "disabled" };
  if (participation === null || typeof participation !== "object" || Array.isArray(participation)) {
    throw new TypeError("participation must be an object");
  }
  if (!PARTICIPATION_MODES.has(participation.mode)) {
    throw new TypeError('participation.mode must be "disabled" or "vaultmaze"');
  }
  const normalizedParticipation = participation.mode === "vaultmaze"
    ? Object.freeze({
        mode: "vaultmaze",
        displayName: nonEmptyString(participation.displayName ?? "VaultMaze", "participation.displayName"),
        engine: nonEmptyString(participation.engine ?? "lantern-compatible/v1", "participation.engine"),
        defaultRoute: "guided",
        directReadClaims: Object.freeze(stringArray(
          participation.directReadClaims ?? [],
          "participation.directReadClaims",
        )),
        accessibilityBypassClaims: Object.freeze(stringArray(
          participation.accessibilityBypassClaims ?? [],
          "participation.accessibilityBypassClaims",
        )),
        targetRetention: participation.targetRetention ?? 0.9,
        familiar: Object.freeze({
          enabled: participation.familiar?.enabled ?? false,
          retrievalMode: participation.familiar?.retrievalMode ?? "delegated-copy",
          costPolicy: participation.familiar?.costPolicy ?? "deployment-defined",
        }),
      })
    : Object.freeze({ mode: "disabled" });
  if (
    normalizedParticipation.mode === "vaultmaze"
    && (typeof normalizedParticipation.targetRetention !== "number"
      || normalizedParticipation.targetRetention <= 0
      || normalizedParticipation.targetRetention > 1)
  ) {
    throw new TypeError("participation.targetRetention must be greater than 0 and at most 1");
  }

  return Object.freeze({
    schemaVersion: offered.schemaVersion,
    id,
    title,
    baseUrl: nonEmptyString(offered.baseUrl, "baseUrl"),
    auth: normalizedAuth,
    participation: normalizedParticipation,
    wings: Object.freeze(wings),
  });
}
