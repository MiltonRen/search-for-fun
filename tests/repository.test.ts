import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NodeRecord } from "../studio/shared/types.js";
import { atomicWriteJson, safePath } from "../studio/server/safe-fs.js";
import { findRepositoryRoot } from "../studio/server/paths.js";
import { NodeBundleCache, validateGameSource } from "../studio/server/node-bundler.js";
import { SearchRepository } from "../studio/server/repository.js";
import { createTemporaryRepository, type TemporaryRepository } from "./helpers.js";

const temporaryRepositories: TemporaryRepository[] = [];

afterEach(async () => {
  await Promise.all(temporaryRepositories.splice(0).map((fixture) => fixture.cleanup()));
});

async function writeNodeFixture(root: string, node: NodeRecord): Promise<void> {
  const nodeDirectory = path.join(root, "searches", node.searchId, "nodes", node.id);
  await mkdir(path.join(nodeDirectory, "game"), { recursive: true });
  await atomicWriteJson(path.join(nodeDirectory, "node.json"), node);
  await writeFile(path.join(nodeDirectory, "hypothesis.md"), `# ${node.title}\n`, "utf8");
  await writeFile(
    path.join(nodeDirectory, "game", "index.ts"),
    `export default { id: ${JSON.stringify(node.id)}, title: ${JSON.stringify(node.title)}, instructions: "", mount() {} };\n`,
    "utf8",
  );
}

describe("repository fixtures", () => {
  it("validates a three-root search with a multi-parent child", async () => {
    const fixture = await createTemporaryRepository();
    temporaryRepositories.push(fixture);
    const first = await fixture.repository.getNodeRecord(fixture.searchId, fixture.nodeId);
    const second: NodeRecord = {
      ...first,
      id: "n_0001_second_root",
      title: "Second Root",
      searchRole: "adjacent",
    };
    const third: NodeRecord = {
      ...first,
      id: "n_0002_third_root",
      title: "Third Root",
      searchRole: "leap",
    };
    const crossover: NodeRecord = {
      ...first,
      id: "n_0003_crossover",
      title: "Crossover",
      parents: [first.id, second.id],
      generation: 1,
      edgeType: "crossover",
      searchRole: "crossover",
    };
    await Promise.all([
      writeNodeFixture(fixture.root, second),
      writeNodeFixture(fixture.root, third),
      writeNodeFixture(fixture.root, crossover),
    ]);
    const search = await fixture.repository.getSearchRecord(fixture.searchId);
    search.nextNodeSequence = 4;
    await atomicWriteJson(path.join(fixture.root, "searches", fixture.searchId, "search.json"), search);

    expect(await fixture.repository.validateSearch(fixture.searchId)).toEqual([]);
    const projection = await fixture.repository.loadProjection(fixture.searchId);
    expect(projection.nodes.filter((node) => node.edgeType === "root")).toHaveLength(3);
    const crossoverProjection = projection.nodes.find((node) => node.edgeType === "crossover");
    expect(crossoverProjection?.parents).toHaveLength(2);
  });

  it("typechecks and bundles a sealed KAPLAY node on demand", async () => {
    const root = await findRepositoryRoot();
    const searchId = `s_20000101_bundle_${process.pid}_${Date.now()}`;
    const nodeId = "n_0000_bundle_fixture";
    const searchDirectory = path.join(root, "searches", searchId);
    const node: NodeRecord = {
      schemaVersion: 1,
      id: nodeId,
      searchId,
      parents: [],
      generation: 0,
      edgeType: "root",
      searchRole: "readable",
      lifecycleStatus: "sealed",
      objectiveRevision: 1,
      createdAt: "2000-01-01T00:00:00.000Z",
      sealedAt: "2000-01-01T00:00:00.000Z",
      title: "Bundle Fixture",
      hypothesis: "The runtime bundle is generated on demand.",
      changesFromParents: [],
      preserve: [],
      provenance: { briefId: "bundle-fixture", report: "Self-contained bundle fixture" },
      runtime: {
        entry: "game/index.ts",
        viewport: { width: 640, height: 640 },
        orientation: "square",
        seed: 1,
        actions: ["primary"],
      },
      validation: {
        schema: "passed",
        typecheck: "passed",
        bundle: "passed",
        boot: "pending",
        consoleErrors: 0,
        screenshot: "pending",
      },
    };
    try {
      await writeNodeFixture(root, node);
      const cache = new NodeBundleCache(root);
      const bundle = await cache.get(searchId, nodeId);
      expect(bundle.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(bundle.code.byteLength).toBeGreaterThan(50_000);
      expect(Buffer.from(bundle.code).toString("utf8")).toContain("Bundle Fixture");
    } finally {
      await rm(searchDirectory, { recursive: true, force: true });
    }
  });

  it("rejects prototype dependencies outside the shared KAPLAY runtime", async () => {
    const root = await findRepositoryRoot();
    const stagingRoot = path.join(root, ".search-for-fun", "staging");
    await mkdir(stagingRoot, { recursive: true });
    const directory = await mkdtemp(path.join(stagingRoot, "dependency-test-"));
    try {
      const entry = path.join(directory, "index.ts");
      const source = [
        'import { createElement } from "react";',
        'import type { SearchForFunGame } from "@search-for-fun/runtime";',
        "void createElement;",
        "const game: SearchForFunGame = { id: 'n_0000_validation', title: 'Invalid dependency', instructions: '', mount() {} };",
        "export default game;",
      ].join("\n");
      await writeFile(entry, source, "utf8");
      await expect(validateGameSource(root, entry)).rejects.toThrow(/outside the allowed KAPLAY runtime/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects KAPLAY v4000 axis mutations that leave rendered transforms stale", async () => {
    const root = await findRepositoryRoot();
    const stagingRoot = path.join(root, ".search-for-fun", "staging");
    await mkdir(stagingRoot, { recursive: true });
    const directory = await mkdtemp(path.join(stagingRoot, "transform-write-test-"));
    try {
      const entry = path.join(directory, "index.ts");
      const source = [
        'import type { KAPLAYCtx } from "kaplay";',
        'import type { SearchForFunGame } from "@search-for-fun/runtime";',
        "const game: SearchForFunGame = {",
        "  id: 'n_0000_validation', title: 'Unsafe movement', instructions: '',",
        "  mount(k: KAPLAYCtx) {",
        "    const player = k.add([k.pos(100, 100), k.scale(1)]);",
        "    k.onUpdate(() => {",
        "      player.pos.x += 120 * k.dt();",
        "      player['scale']['y'] = 1.2;",
        "    });",
        "  },",
        "};",
        "export default game;",
      ].join("\n");
      await writeFile(entry, source, "utf8");
      await expect(validateGameSource(root, entry)).rejects.toThrow(/frozen actors or detached effects/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts complete Vec2 assignments and KAPLAY movement helpers", async () => {
    const root = await findRepositoryRoot();
    const stagingRoot = path.join(root, ".search-for-fun", "staging");
    await mkdir(stagingRoot, { recursive: true });
    const directory = await mkdtemp(path.join(stagingRoot, "safe-transform-test-"));
    try {
      const entry = path.join(directory, "index.ts");
      const source = [
        'import type { KAPLAYCtx } from "kaplay";',
        'import type { SearchForFunGame } from "@search-for-fun/runtime";',
        "const game: SearchForFunGame = {",
        "  id: 'n_0000_validation', title: 'Safe movement', instructions: '',",
        "  mount(k: KAPLAYCtx) {",
        "    const player = k.add([k.pos(100, 100), k.scale(1)]);",
        "    k.onUpdate(() => {",
        "      player.move(120, 0);",
        "      player.pos = k.vec2(player.pos.x, player.pos.y + k.dt());",
        "      player.scaleTo(1.2);",
        "    });",
        "  },",
        "};",
        "export default game;",
      ].join("\n");
      await writeFile(entry, source, "utf8");
      await expect(validateGameSource(root, entry)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("repository invariants", () => {
  it("records evaluations and moves commands idempotently through durable states", async () => {
    const fixture = await createTemporaryRepository();
    temporaryRepositories.push(fixture);
    const searchDirectory = path.join(fixture.root, "searches", fixture.searchId);
    await rm(path.join(searchDirectory, "evaluations"), { recursive: true, force: true });
    const evaluation = await fixture.repository.recordEvaluation(fixture.searchId, {
      nodeId: fixture.nodeId,
      session: { id: "session-test-123", durationSeconds: 18, restarts: 1, completed: true },
      ratings: { fun: 4, readability: 5 },
      preserve: "Clear motion",
      change: "More pressure",
      note: "Readable immediately",
    });
    expect(evaluation.id).toMatch(/^ev_/);

    await rm(path.join(searchDirectory, "commands"), { recursive: true, force: true });
    const command = await fixture.repository.queueCommand(fixture.searchId, {
      type: "expand",
      nodeIds: [fixture.nodeId],
      mode: "single",
      instruction: "Preserve the motion and add pressure.",
    });
    expect(command.status).toBe("pending");
    expect((await fixture.repository.claimPendingCommand(fixture.searchId, command.id)).status).toBe("processing");
    const completed = await fixture.repository.completeCommand(fixture.searchId, command.id, {
      completedAt: "2026-07-19T20:10:00.000Z",
      nodeIds: [],
      summary: "No child imported in the state-machine test.",
    });
    expect(completed.status).toBe("processed");

    const failedCommand = await fixture.repository.queueCommand(fixture.searchId, {
      type: "leap",
      nodeIds: [fixture.nodeId],
      mode: "single",
      instruction: "Attempt a deliberately distant move.",
    });
    await fixture.repository.claimPendingCommand(fixture.searchId, failedCommand.id);
    const failed = await fixture.repository.failCommand(fixture.searchId, failedCommand.id, "Scout validation failed.");
    expect(failed).toMatchObject({ status: "error", error: "Scout validation failed." });

    const selectCommand = await fixture.repository.queueCommand(fixture.searchId, {
      type: "select",
      nodeIds: [fixture.nodeId],
      mode: "single",
      instruction: "Select the measured branch.",
    });
    await fixture.repository.claimPendingCommand(fixture.searchId, selectCommand.id);
    await fixture.repository.completeCommand(fixture.searchId, selectCommand.id, {
      completedAt: "2026-07-19T20:12:00.000Z",
      nodeIds: [fixture.nodeId],
      summary: "Selected the fixture branch.",
    });
    await fixture.repository.recordRuntimeFailure(fixture.searchId, fixture.nodeId, "Synthetic runtime error");
    const projection = await fixture.repository.loadProjection(fixture.searchId);
    expect(projection.nodes[0]?.evaluations).toHaveLength(1);
    expect(projection.nodes[0]?.validation).toMatchObject({ boot: "failed", consoleErrors: 1 });
    expect(projection.commands.map((candidate) => candidate.status).sort()).toEqual(["error", "processed", "processed"]);
    expect(projection.search).toMatchObject({ status: "selected", phase: "candidate" });
  });

  it("detects graph cycles without losing readable diagnostics", async () => {
    const fixture = await createTemporaryRepository();
    temporaryRepositories.push(fixture);
    const first = await fixture.repository.getNodeRecord(fixture.searchId, fixture.nodeId);
    const second: NodeRecord = {
      ...first,
      id: "n_0001_second",
      title: "Second",
      parents: [first.id],
      generation: 1,
      edgeType: "refine",
      searchRole: "refinement",
    };
    const secondDirectory = path.join(fixture.root, "searches", fixture.searchId, "nodes", second.id);
    await mkdir(secondDirectory, { recursive: true });
    await atomicWriteJson(path.join(secondDirectory, "node.json"), second);
    first.parents = [second.id];
    first.edgeType = "refine";
    await atomicWriteJson(path.join(fixture.root, "searches", fixture.searchId, "nodes", first.id, "node.json"), first);
    expect(await fixture.repository.validateSearch(fixture.searchId)).toContain(`${first.id}: graph contains a cycle`);
  });

  it("rejects lexical traversal and symlink escapes", async () => {
    const fixture = await createTemporaryRepository();
    temporaryRepositories.push(fixture);
    await expect(safePath(fixture.root, "..")).rejects.toThrow(/Unsafe path|boundary/);
    const linkPath = path.join(fixture.root, "searches", "outside-link");
    await symlink(path.dirname(fixture.root), linkPath);
    await expect(safePath(fixture.root, "searches", "outside-link", "file.json")).rejects.toThrow(/Symlink/);
    const stagingLink = path.join(fixture.root, ".search-for-fun", "staging", "outside-link");
    await symlink(path.dirname(fixture.root), stagingLink);
    await expect(fixture.repository.importStagedNode(fixture.searchId, stagingLink)).rejects.toThrow(/boundary/);
    await expect(fixture.repository.claimPendingCommand(fixture.searchId, "../../outside"))
      .rejects.toThrow(/Invalid command ID/);
  });
});
