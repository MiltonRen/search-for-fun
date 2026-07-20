import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NodeRecord, SearchRecord } from "../studio/shared/types.js";
import { atomicWriteJson, atomicWriteText } from "../studio/server/safe-fs.js";
import { SearchRepository } from "../studio/server/repository.js";

export interface TemporaryRepository {
  root: string;
  repository: SearchRepository;
  searchId: string;
  nodeId: string;
  cleanup(): Promise<void>;
}

export async function createTemporaryRepository(): Promise<TemporaryRepository> {
  const sourceRoot = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "search-for-fun-test-"));
  await mkdir(path.join(root, "schemas"), { recursive: true });
  await cp(path.join(sourceRoot, "schemas"), path.join(root, "schemas"), { recursive: true });
  await atomicWriteJson(path.join(root, "package.json"), { name: "search-for-fun", private: true });
  const repository = await SearchRepository.create(root);
  const search = await repository.createSearch(
    {
      title: "Test Search",
      successMode: "joy",
      fantasy: "Keep a paper star in the sky",
      desiredFeeling: ["calm", "curious"],
      sessionLengthSeconds: [20, 60],
      constraints: ["one button"],
      rubric: ["fun", "readability"],
      innovationTarget: "balanced",
      codexThreadId: "thread_test_123",
    },
    new Date("2026-07-19T20:00:00.000Z"),
  );
  const nodeId = "n_0000_paper_star";
  const timestamp = "2026-07-19T20:01:00.000Z";
  const node: NodeRecord = {
    schemaVersion: 1,
    id: nodeId,
    searchId: search.id,
    parents: [],
    generation: 0,
    edgeType: "root",
    searchRole: "readable",
    lifecycleStatus: "sealed",
    objectiveRevision: 1,
    createdAt: timestamp,
    sealedAt: timestamp,
    title: "Paper Star",
    hypothesis: "One readable action can keep the star aloft.",
    changesFromParents: [],
    preserve: ["one button"],
    provenance: { briefId: "test-brief", report: "Test fixture" },
    runtime: {
      entry: "game/index.ts",
      viewport: { width: 960, height: 540 },
      orientation: "landscape",
      seed: 42,
      actions: ["primary", "restart"],
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
  repository.schemas.validate("node", node);
  const nodeDirectory = path.join(root, "searches", search.id, "nodes", nodeId);
  await mkdir(path.join(nodeDirectory, "game"), { recursive: true });
  await atomicWriteJson(path.join(nodeDirectory, "node.json"), node);
  await atomicWriteText(path.join(nodeDirectory, "hypothesis.md"), `# ${node.title}\n`);
  await atomicWriteText(
    path.join(nodeDirectory, "game", "index.ts"),
    "export default { id: 'n_0000_paper_star', title: 'Paper Star', instructions: '', mount() {} };\n",
  );
  const updatedSearch = await repository.getSearchRecord(search.id);
  updatedSearch.nextNodeSequence = 1;
  updatedSearch.updatedAt = timestamp;
  await atomicWriteJson(path.join(root, "searches", search.id, "search.json"), updatedSearch satisfies SearchRecord);
  return {
    root,
    repository,
    searchId: search.id,
    nodeId,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
