import assert from "node:assert/strict";
import test from "node:test";
import { composeKnowledgeVault } from "../src/compose.mjs";
import { validateKnowledgeVaultConfig } from "../src/config.mjs";
import { evaluateVaultMazePassage } from "../src/passage.mjs";

const config = {
  schemaVersion: "knowledge-vault-config/v1",
  id: "test-vault",
  title: "Test Vault",
  baseUrl: "https://example.test",
  auth: {
    mode: "oauth",
    issuer: "https://identity.example.test",
    clientIdEnvironmentVariable: "TEST_OAUTH_CLIENT_ID",
    clientSecretEnvironmentVariable: "TEST_OAUTH_CLIENT_SECRET",
  },
  wings: [{
    id: "science",
    root: "/vault",
    excludeGlobs: ["legacy"],
    tufte: { strategy: "force-directed", columns: 64 },
  }],
};

test("configuration names environment variables but contains no OAuth secret", () => {
  const actual = validateKnowledgeVaultConfig(config);
  assert.equal(actual.auth.mode, "oauth");
  assert.equal("clientSecret" in actual.auth, false);
  assert.equal(actual.auth.clientSecretEnvironmentVariable, "TEST_OAUTH_CLIENT_SECRET");
});

test("configuration admits a deployment-verified identity proxy without OAuth secrets", () => {
  const actual = validateKnowledgeVaultConfig({
    ...config,
    auth: {
      mode: "identity-proxy",
      provider: "cloudflare-access",
      identityContext: "workers-ctx-access/v1",
    },
  });
  assert.deepEqual(actual.auth, {
    mode: "identity-proxy",
    provider: "cloudflare-access",
    identityContext: "workers-ctx-access/v1",
  });
});

test("composition keeps semantic SPACE separate from visual TUFTE", async () => {
  const compiler = {
    compileVault(root, wing, options) {
      assert.equal(root, "/vault");
      assert.deepEqual(options.excludeGlobs, ["legacy"]);
      return {
        dialect: "house",
        dialectReason: "test",
        world: {
          wingId: wing.id,
          rooms: [{
            id: "note.md", wingId: wing.id, title: "Note", aliases: [], kind: "note",
            body: "", frontmatter: { "science-owner": "knowledge-systems-services-section" },
          }],
          doors: [], halls: [], cards: [], warnings: [],
        },
      };
    },
    buildLayout() {
      return { wingId: "science", positions: { "note.md": { x: 3, y: 5 } } };
    },
  };
  const actual = await composeKnowledgeVault(config, compiler);
  assert.equal(actual.vocabulary.SPACE, "Semantic Position Arranging Conceptual Elements");
  assert.equal(actual.vocabulary.TUFTE, "Tiling User Frontend Topology Engine");
  assert.equal(actual.wings[0].space[0].semanticPosition.scienceOwner, "knowledge-systems-services-section");
  assert.deepEqual(
    { x: actual.wings[0].tufte[0].x, y: actual.wings[0].tufte[0].y },
    { x: 3, y: 5 },
  );
});

test("duplicate wing ids are rejected", () => {
  assert.throws(
    () => validateKnowledgeVaultConfig({ ...config, wings: [...config.wings, ...config.wings] }),
    /duplicate wing id/,
  );
});

const passage = {
  mode: "vaultmaze",
  targetRetention: 0.9,
  directReadClaims: ["vault:direct"],
  accessibilityBypassClaims: ["vault:accessible"],
  familiar: { enabled: true, costPolicy: "test-cost/v1" },
};
const passageWorld = {
  rooms: [{ id: "intro.md" }, { id: "advanced.md" }],
  doors: [{ from: "intro.md", to: "advanced.md", weight: "hard" }],
  cards: [
    { id: "intro-card", roomId: "intro.md", stability: 2 },
    { id: "advanced-card", roomId: "advanced.md", stability: 2 },
  ],
};
const recallProbability = (elapsed, stability) => elapsed <= stability ? 1 : 0;

test("VaultMaze gates complex rooms on unreviewed prerequisite and target cards", () => {
  const actual = evaluateVaultMazePassage({
    passage, world: passageWorld, targetRoomId: "advanced.md", now: 10, recallProbability,
  });
  assert.equal(actual.allowed, false);
  assert.deepEqual(actual.requiredCards.map(({ cardId, reason }) => [cardId, reason]), [
    ["advanced-card", "unreviewed"], ["intro-card", "unreviewed"],
  ]);
});

test("VaultMaze honors explicit bypass claims and familiar retrieval grants no learning credit", () => {
  const direct = evaluateVaultMazePassage({
    passage, world: passageWorld, targetRoomId: "advanced.md", claims: ["vault:direct"],
    now: 10, recallProbability,
  });
  assert.equal(direct.route, "authorized-direct-read");
  const familiar = evaluateVaultMazePassage({
    passage, world: passageWorld, targetRoomId: "advanced.md", requestFamiliar: true,
    now: 10, recallProbability,
  });
  assert.equal(familiar.route, "familiar-retrieval");
  assert.equal(familiar.learningCredit, false);
  assert.equal(familiar.costPolicy, "test-cost/v1");
});
