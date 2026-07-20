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

describe("canonical fixture", () => {
  it("validates a three-root search with a multi-parent child", async () => {
    const root = await findRepositoryRoot();
    const repository = await SearchRepository.create(root);
    const searchId = "s_20260720_lighthouse_in_a_storm";
    expect(await repository.validateSearch(searchId)).toEqual([]);
    const projection = await repository.loadProjection(searchId);
    expect(projection.nodes.filter((node) => node.edgeType === "root")).toHaveLength(3);
    const crossover = projection.nodes.find((node) => node.edgeType === "crossover");
    expect(crossover?.parents).toHaveLength(2);
  });

  it("typechecks and bundles a sealed KAPLAY node on demand", async () => {
    const root = await findRepositoryRoot();
    const cache = new NodeBundleCache(root);
    const bundle = await cache.get("s_20260720_lighthouse_in_a_storm", "n_0000_beam_rhythm");
    expect(bundle.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.code.byteLength).toBeGreaterThan(50_000);
    expect(Buffer.from(bundle.code).toString("utf8")).toContain("Beam Rhythm");
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
