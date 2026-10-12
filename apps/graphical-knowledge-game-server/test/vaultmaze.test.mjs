import assert from "node:assert/strict";
import test from "node:test";
import { composeVaultMaze } from "../src/compose.mjs";
import { validateVaultMazeConfig } from "../src/config.mjs";

const config = {
  schemaVersion: "vaultmaze-config/v1",
  id: "test-maze",
  title: "Test Maze",
  baseUrl: "https://example.test/",
  auth: { mode: "disabled" },
  participation: { mode: "disabled" },
  wings: [{ id: "main", root: "/vault", excludeGlobs: [], tufte: { strategy: "tiling-grid", columns: 8 } }],
};

test("VaultMaze validates and composes a TUFTE user-form topology without owning content", async () => {
  assert.equal(validateVaultMazeConfig(config).id, "test-maze");
  const actual = await composeVaultMaze(config, {
    async compileVault() {
      return {
        dialect: "house",
        dialectReason: "test",
        world: { rooms: [{ id: "one", title: "One", frontmatter: {} }], doors: [], cards: [] },
      };
    },
    buildLayout() {
      throw new Error("tiling-grid must not ask for force-directed layout");
    },
  });
  assert.equal(actual.vocabulary.TUFTE, "Tiling User Form Topology Engine");
  assert.equal(actual.wings[0].tufte[0].topology, "tile");
});
