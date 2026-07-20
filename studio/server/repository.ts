import { randomBytes, randomInt } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type {
  CommandRecord,
  CommandType,
  EffectiveNodeState,
  EvaluationRecord,
  JsonValue,
  NodeProjection,
  NodeRecord,
  ObjectiveRecord,
  SearchEvent,
  SearchListItem,
  SearchProjection,
  SearchRecord,
} from "../shared/types.js";
import { assertCommandId, assertNodeId, assertSearchId, NODE_ID_PATTERN, slugify } from "./paths.js";
import {
  appendJsonLine,
  assertRealPathWithin,
  atomicWriteBuffer,
  atomicWriteJson,
  atomicWriteText,
  exists,
  moveAtomically,
  readJson,
  readJsonLines,
  safePath,
  withFileLock,
} from "./safe-fs.js";
import { SchemaRegistry } from "./schema-registry.js";
import { validateGameSource } from "./node-bundler.js";

export interface EvaluationInput {
  nodeId: string;
  session: EvaluationRecord["session"];
  ratings: Record<string, number | null>;
  preserve: string;
  change: string;
  note: string;
  nextMove?: string;
  telemetry?: EvaluationRecord["telemetry"];
}

export interface CommandInput {
  type: CommandType;
  nodeIds: string[];
  mode: CommandRecord["mode"];
  instruction: string;
}

export interface CreateSearchInput {
  title: string;
  successMode: ObjectiveRecord["successMode"];
  fantasy: string;
  desiredFeeling: string[];
  sessionLengthSeconds: [number, number];
  constraints: string[];
  rubric: string[];
  referenceGames?: string[];
  avoidPatterns?: string[];
  innovationTarget?: ObjectiveRecord["innovationTarget"];
}

export interface ScoutResult {
  schemaVersion: 1;
  briefId: string;
  title: string;
  hypothesis: string;
  searchRole: NodeRecord["searchRole"];
  edgeType: NodeRecord["edgeType"];
  parents: string[];
  changesFromParents: string[];
  preserve: string[];
  report: string;
  actions: string[];
  seed?: number;
  viewport?: { width: number; height: number };
}

function timestampToken(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

const MAX_STAGED_FILE_BYTES = 8 * 1024 * 1024;
const MAX_STAGED_NODE_BYTES = 24 * 1024 * 1024;
const MAX_STAGED_FILES = 256;

async function validateStagingTree(stagingRoot: string): Promise<void> {
  let fileCount = 0;
  let totalBytes = 0;

  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      const relativePath = path.relative(stagingRoot, filePath).split(path.sep).join("/");
      if (entry.name.startsWith(".")) throw new Error(`Hidden staged paths are not allowed: ${relativePath}`);
      if (entry.isSymbolicLink()) throw new Error(`Staged symlinks are not allowed: ${relativePath}`);
      if (entry.isDirectory()) {
        await visit(filePath);
        continue;
      }
      if (!entry.isFile()) throw new Error(`Unsupported staged path type: ${relativePath}`);

      const isManifest = relativePath === "result.json" || relativePath === "hypothesis.md";
      const isGameSource = /^game\/(?!assets\/).+\.(?:ts|tsx|js|mjs)$/.test(relativePath);
      const isAsset = relativePath.startsWith("game/assets/");
      if (!isManifest && !isGameSource && !isAsset) {
        throw new Error(`Unexpected staged file: ${relativePath}`);
      }

      const info = await lstat(filePath);
      fileCount += 1;
      totalBytes += info.size;
      if (info.size > MAX_STAGED_FILE_BYTES) throw new Error(`Staged file is too large: ${relativePath}`);
      if (fileCount > MAX_STAGED_FILES || totalBytes > MAX_STAGED_NODE_BYTES) {
        throw new Error("Staged node exceeds the file-count or total-size limit");
      }
    }
  };

  await visit(stagingRoot);
}

function durableId(prefix: "ev" | "cmd" | "evt"): string {
  return `${prefix}_${timestampToken()}_${randomBytes(4).toString("hex")}`;
}

function asJsonRecord(value: Record<string, JsonValue>): JsonValue {
  return value;
}

function defaultNodeState(): EffectiveNodeState {
  return { favorite: false, archived: false, rejected: false, selected: false, pending: false };
}

function deriveNodeStates(nodes: NodeRecord[], commands: CommandRecord[]): Map<string, EffectiveNodeState> {
  const states = new Map(nodes.map((node) => [node.id, defaultNodeState()]));
  const ordered = [...commands].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  for (const command of ordered) {
    for (const nodeId of command.nodeIds) {
      const state = states.get(nodeId);
      if (!state) continue;
      if (command.status === "pending" || command.status === "processing") state.pending = true;
      if (command.status === "error") continue;
      if (command.type === "favorite") state.favorite = true;
      if (command.type === "archive") state.archived = true;
      if (command.type === "reject") state.rejected = true;
      if (command.type === "select") state.selected = true;
    }
  }
  return states;
}

export class SearchRepository {
  private constructor(
    readonly root: string,
    readonly schemas: SchemaRegistry,
  ) {}

  static async create(root: string): Promise<SearchRepository> {
    const schemas = await SchemaRegistry.create(root);
    const repository = new SearchRepository(root, schemas);
    await repository.ensureWorkingDirectories();
    return repository;
  }

  get searchesRoot(): string {
    return path.join(this.root, "searches");
  }

  private async ensureWorkingDirectories(): Promise<void> {
    const directories = await Promise.all([
      safePath(this.root, "searches"),
      safePath(this.root, ".search-for-fun", "staging"),
      safePath(this.root, ".search-for-fun", "locks"),
      safePath(this.root, ".search-for-fun", "cache"),
    ]);
    await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
  }

  private async searchDirectory(searchId: string): Promise<string> {
    assertSearchId(searchId);
    return safePath(this.root, "searches", searchId);
  }

  private async nodeDirectory(searchId: string, nodeId: string): Promise<string> {
    assertNodeId(nodeId);
    return safePath(await this.searchDirectory(searchId), "nodes", nodeId);
  }

  private lockPath(searchId: string): string {
    assertSearchId(searchId);
    return path.join(this.root, ".search-for-fun", "locks", `${searchId}.lock`);
  }

  async listSearches(): Promise<SearchListItem[]> {
    const entries = await readdir(await safePath(this.root, "searches"), { withFileTypes: true });
    const searches: SearchListItem[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^s_/.test(entry.name)) continue;
      try {
        const directory = await this.searchDirectory(entry.name);
        const record = await readJson<SearchRecord>(await safePath(directory, "search.json"));
        this.schemas.validate("search", record);
        const nodeDirectory = await safePath(directory, "nodes");
        const nodeCount = (await exists(nodeDirectory))
          ? (await readdir(nodeDirectory, { withFileTypes: true }))
              .filter((node) => node.isDirectory() && NODE_ID_PATTERN.test(node.name)).length
          : 0;
        searches.push({
          id: record.id,
          title: record.title,
          status: record.status,
          phase: record.phase,
          nodeCount,
          updatedAt: record.updatedAt,
        });
      } catch {
        // One malformed search must not prevent other searches from loading.
      }
    }

    return searches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getSearchRecord(searchId: string): Promise<SearchRecord> {
    const directory = await this.searchDirectory(searchId);
    const record = await readJson<SearchRecord>(await safePath(directory, "search.json"));
    this.schemas.validate("search", record);
    return record;
  }

  async getNodeRecord(searchId: string, nodeId: string): Promise<NodeRecord> {
    const directory = await this.nodeDirectory(searchId, nodeId);
    const record = await readJson<NodeRecord>(await safePath(directory, "node.json"));
    this.schemas.validate("node", record);
    if (record.searchId !== searchId || record.id !== nodeId) {
      throw new Error("Node identity does not match its canonical path");
    }
    return record;
  }

  async loadProjection(searchId: string): Promise<SearchProjection> {
    const searchDirectory = await this.searchDirectory(searchId);
    const search = await this.getSearchRecord(searchId);
    const objectivePath = await safePath(
      searchDirectory,
      "objectives",
      `rev_${String(search.activeObjectiveRevision).padStart(4, "0")}.json`,
    );
    const objective = await readJson<ObjectiveRecord>(objectivePath);
    this.schemas.validate("objective", objective);
    if (objective.searchId !== searchId || objective.revision !== search.activeObjectiveRevision) {
      throw new Error("Active objective identity does not match the search record");
    }

    const diagnostics: SearchProjection["diagnostics"] = [];
    const nodes: NodeRecord[] = [];
    const nodesRoot = await safePath(searchDirectory, "nodes");
    if (await exists(nodesRoot)) {
      for (const entry of await readdir(nodesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          nodes.push(await this.getNodeRecord(searchId, entry.name));
        } catch (error) {
          diagnostics.push({ path: `nodes/${entry.name}`, message: (error as Error).message });
        }
      }
    }

    const evaluationsByNode = new Map<string, EvaluationRecord[]>();
    const evaluationsRoot = await safePath(searchDirectory, "evaluations", "sessions");
    if (await exists(evaluationsRoot)) {
      for (const entry of await readdir(evaluationsRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const evaluation = await readJson<EvaluationRecord>(await safePath(evaluationsRoot, entry.name));
          this.schemas.validate("evaluation", evaluation);
          if (
            entry.name !== `${evaluation.id}.json` ||
            evaluation.searchId !== searchId ||
            !nodes.some((node) => node.id === evaluation.nodeId)
          ) {
            throw new Error("Evaluation identity or node reference is invalid");
          }
          const bucket = evaluationsByNode.get(evaluation.nodeId) ?? [];
          bucket.push(evaluation);
          evaluationsByNode.set(evaluation.nodeId, bucket);
        } catch (error) {
          diagnostics.push({ path: `evaluations/sessions/${entry.name}`, message: (error as Error).message });
        }
      }
    }

    const commands: CommandRecord[] = [];
    for (const state of ["pending", "processing", "processed"] as const) {
      const commandRoot = await safePath(searchDirectory, "commands", state);
      if (!(await exists(commandRoot))) continue;
      for (const entry of await readdir(commandRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        try {
          const command = await readJson<CommandRecord>(await safePath(commandRoot, entry.name));
          this.schemas.validate("command", command);
          const validState = command.status === state || (state === "processed" && command.status === "error");
          if (entry.name !== `${command.id}.json` || command.searchId !== searchId || !validState) {
            throw new Error("Command identity or durable state is invalid");
          }
          commands.push(command);
        } catch (error) {
          diagnostics.push({ path: `commands/${state}/${entry.name}`, message: (error as Error).message });
        }
      }
    }

    const rawEvents = await readJsonLines<SearchEvent>(await safePath(searchDirectory, "events.jsonl"));
    const events = rawEvents.filter((event, index) => {
      try {
        this.schemas.validate("event", event);
        if (event.searchId !== searchId) throw new Error("Event search identity is invalid");
        return true;
      } catch (error) {
        diagnostics.push({ path: `events.jsonl:${index + 1}`, message: (error as Error).message });
        return false;
      }
    });

    const states = deriveNodeStates(nodes, commands);
    const projections: NodeProjection[] = nodes
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => ({
        ...node,
        previewUrl: node.validation.screenshot === "preview.png"
          ? `/api/searches/${searchId}/nodes/${node.id}/preview`
          : null,
        playUrl: `/play/${searchId}/${node.id}`,
        evaluations: (evaluationsByNode.get(node.id) ?? []).sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
        effectiveState: states.get(node.id) ?? defaultNodeState(),
      }));

    return {
      search,
      objective,
      nodes: projections,
      commands: commands.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      events,
      workspacePath: this.root,
      diagnostics,
    };
  }

  async createSearch(input: CreateSearchInput, now = new Date()): Promise<SearchRecord> {
    if (input.sessionLengthSeconds[0] > input.sessionLengthSeconds[1]) {
      throw new Error("Session length minimum cannot exceed its maximum");
    }
    const dateToken = now.toISOString().slice(0, 10).replaceAll("-", "");
    const baseId = `s_${dateToken}_${slugify(input.title)}`;
    let searchId = baseId;
    let suffix = 2;
    while (await exists(path.join(this.searchesRoot, searchId))) {
      searchId = `${baseId}_${suffix}`;
      suffix += 1;
    }

    const timestamp = now.toISOString();
    const search: SearchRecord = {
      schemaVersion: 1,
      id: searchId,
      title: input.title,
      status: "exploring",
      phase: "exploration",
      createdAt: timestamp,
      updatedAt: timestamp,
      engine: { name: "kaplay", version: "4000.0.0-alpha.27.1" },
      activeObjectiveRevision: 1,
      nextNodeSequence: 0,
    };
    const objective: ObjectiveRecord = {
      schemaVersion: 1,
      searchId,
      revision: 1,
      createdAt: timestamp,
      successMode: input.successMode,
      fantasy: input.fantasy,
      desiredFeeling: input.desiredFeeling,
      sessionLengthSeconds: input.sessionLengthSeconds,
      constraints: input.constraints,
      rubric: input.rubric,
      ...(input.referenceGames ? { referenceGames: input.referenceGames } : {}),
      ...(input.avoidPatterns ? { avoidPatterns: input.avoidPatterns } : {}),
      ...(input.innovationTarget ? { innovationTarget: input.innovationTarget } : {}),
    };
    this.schemas.validate("search", search);
    this.schemas.validate("objective", objective);

    const finalDirectory = await safePath(this.searchesRoot, searchId);
    const temporaryDirectory = await safePath(this.searchesRoot, `.${searchId}.${randomBytes(4).toString("hex")}.tmp`);
    try {
      await Promise.all([
        mkdir(path.join(temporaryDirectory, "objectives"), { recursive: true }),
        mkdir(path.join(temporaryDirectory, "nodes"), { recursive: true }),
        mkdir(path.join(temporaryDirectory, "evaluations", "sessions"), { recursive: true }),
        mkdir(path.join(temporaryDirectory, "commands", "pending"), { recursive: true }),
        mkdir(path.join(temporaryDirectory, "commands", "processing"), { recursive: true }),
        mkdir(path.join(temporaryDirectory, "commands", "processed"), { recursive: true }),
        mkdir(path.join(temporaryDirectory, "attempts"), { recursive: true }),
      ]);
      await atomicWriteJson(path.join(temporaryDirectory, "search.json"), search);
      await atomicWriteJson(path.join(temporaryDirectory, "objectives", "rev_0001.json"), objective);
      await atomicWriteText(path.join(temporaryDirectory, "events.jsonl"), "");
      await moveAtomically(temporaryDirectory, finalDirectory);
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
    await this.appendEvent(searchId, "search_created", { objectiveRevision: 1 });
    return search;
  }

  async recordEvaluation(searchId: string, input: EvaluationInput): Promise<EvaluationRecord> {
    assertNodeId(input.nodeId);
    const node = await this.getNodeRecord(searchId, input.nodeId);
    const record: EvaluationRecord = {
      schemaVersion: 1,
      id: durableId("ev"),
      type: "human_playtest",
      searchId,
      nodeId: input.nodeId,
      objectiveRevision: node.objectiveRevision,
      createdAt: new Date().toISOString(),
      session: input.session,
      ratings: input.ratings,
      preserve: input.preserve,
      change: input.change,
      note: input.note,
      ...(input.nextMove ? { nextMove: input.nextMove } : {}),
      ...(input.telemetry ? { telemetry: input.telemetry.slice(0, 500) } : {}),
    };
    this.schemas.validate("evaluation", record);
    const objectivePath = await safePath(
      await this.searchDirectory(searchId),
      "objectives",
      `rev_${String(record.objectiveRevision).padStart(4, "0")}.json`,
    );
    const objective = await readJson<ObjectiveRecord>(objectivePath);
    for (const rating of Object.keys(record.ratings)) {
      if (!objective.rubric.includes(rating)) throw new Error(`Unknown rubric dimension: ${rating}`);
    }

    return withFileLock(this.lockPath(searchId), async () => {
      const searchDirectory = await this.searchDirectory(searchId);
      const evaluationsDirectory = await safePath(searchDirectory, "evaluations", "sessions");
      await mkdir(evaluationsDirectory, { recursive: true });
      await atomicWriteJson(
        await safePath(evaluationsDirectory, `${record.id}.json`),
        record,
      );
      const search = await this.getSearchRecord(searchId);
      search.updatedAt = record.createdAt;
      await atomicWriteJson(await safePath(searchDirectory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "evaluation_recorded", {
        evaluationId: record.id,
        nodeId: record.nodeId,
      });
      return record;
    });
  }

  async queueCommand(searchId: string, input: CommandInput): Promise<CommandRecord> {
    if (input.nodeIds.length === 0) throw new Error("Select at least one node");
    const uniqueNodeIds = [...new Set(input.nodeIds)];
    await Promise.all(uniqueNodeIds.map((nodeId) => this.getNodeRecord(searchId, nodeId)));
    if (input.type === "cross" && uniqueNodeIds.length < 2) {
      throw new Error("A crossover requires at least two parent nodes");
    }
    if (input.type === "cross" && input.mode !== "crossover") {
      throw new Error("Crossover commands must use crossover mode");
    }

    const record: CommandRecord = {
      schemaVersion: 1,
      id: durableId("cmd"),
      type: input.type,
      searchId,
      nodeIds: uniqueNodeIds,
      mode: input.mode,
      instruction: input.instruction.trim(),
      createdAt: new Date().toISOString(),
      createdBy: "studio",
      status: "pending",
    };
    this.schemas.validate("command", record);

    return withFileLock(this.lockPath(searchId), async () => {
      const searchDirectory = await this.searchDirectory(searchId);
      const pendingDirectory = await safePath(searchDirectory, "commands", "pending");
      await mkdir(pendingDirectory, { recursive: true });
      await atomicWriteJson(await safePath(pendingDirectory, `${record.id}.json`), record);
      const search = await this.getSearchRecord(searchId);
      search.updatedAt = record.createdAt;
      await atomicWriteJson(await safePath(searchDirectory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "command_queued", {
        commandId: record.id,
        type: record.type,
        nodeIds: record.nodeIds,
      });
      return record;
    });
  }

  async savePreview(searchId: string, nodeId: string, dataUrl: string): Promise<void> {
    if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("Preview must be a PNG data URL");
    const encoded = dataUrl.slice("data:image/png;base64,".length);
    if (encoded.length > 8_000_000) throw new Error("Preview is too large");
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length < 8 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("Preview data is not a PNG");
    }
    const nodeDirectory = await this.nodeDirectory(searchId, nodeId);

    await withFileLock(this.lockPath(searchId), async () => {
      const node = await this.getNodeRecord(searchId, nodeId);
      await atomicWriteBuffer(await safePath(nodeDirectory, "preview.png"), buffer);
      node.validation.boot = "passed";
      node.validation.screenshot = "preview.png";
      await atomicWriteJson(await safePath(nodeDirectory, "node.json"), node);
      const search = await this.getSearchRecord(searchId);
      search.updatedAt = new Date().toISOString();
      const searchDirectory = await this.searchDirectory(searchId);
      await atomicWriteJson(await safePath(searchDirectory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "preview_captured", { nodeId });
    });
  }

  async recordRuntimeFailure(searchId: string, nodeId: string, reason: string): Promise<void> {
    const failureReason = reason.trim().slice(0, 2000) || "Prototype runtime failed without a reason";
    const nodeDirectory = await this.nodeDirectory(searchId, nodeId);
    await withFileLock(this.lockPath(searchId), async () => {
      const node = await this.getNodeRecord(searchId, nodeId);
      node.validation.boot = "failed";
      node.validation.consoleErrors += 1;
      await atomicWriteJson(await safePath(nodeDirectory, "node.json"), node);
      const failedAt = new Date().toISOString();
      const searchDirectory = await this.searchDirectory(searchId);
      const search = await this.getSearchRecord(searchId);
      search.updatedAt = failedAt;
      await atomicWriteJson(await safePath(searchDirectory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "node_validation_failed", {
        nodeId,
        reason: failureReason,
      });
    });
  }

  async getPreviewPath(searchId: string, nodeId: string): Promise<string> {
    const directory = await this.nodeDirectory(searchId, nodeId);
    const preview = await safePath(directory, "preview.png");
    if (!(await exists(preview))) throw new Error("Preview not found");
    return preview;
  }

  async getAssetPath(searchId: string, nodeId: string, relativeAssetPath: string): Promise<string> {
    if (!relativeAssetPath || relativeAssetPath.includes("..") || path.isAbsolute(relativeAssetPath)) {
      throw new Error("Invalid asset path");
    }
    const nodeDirectory = await this.nodeDirectory(searchId, nodeId);
    const asset = await safePath(nodeDirectory, "game", "assets", ...relativeAssetPath.split("/"));
    if (!(await exists(asset))) throw new Error("Asset not found");
    return asset;
  }

  async appendEvent(
    searchId: string,
    type: SearchEvent["type"],
    payload: Record<string, JsonValue>,
  ): Promise<SearchEvent> {
    return withFileLock(this.lockPath(searchId), () => this.appendEventUnlocked(searchId, type, payload));
  }

  private async appendEventUnlocked(
    searchId: string,
    type: SearchEvent["type"],
    payload: Record<string, JsonValue>,
  ): Promise<SearchEvent> {
    const event: SearchEvent = {
      schemaVersion: 1,
      id: durableId("evt"),
      type,
      searchId,
      createdAt: new Date().toISOString(),
      payload,
    };
    this.schemas.validate("event", event);
    const directory = await this.searchDirectory(searchId);
    await appendJsonLine(await safePath(directory, "events.jsonl"), asJsonRecord(event as unknown as Record<string, JsonValue>));
    return event;
  }

  async validateSearch(searchId: string): Promise<string[]> {
    const issues: string[] = [];
    let projection: SearchProjection;
    try {
      projection = await this.loadProjection(searchId);
      issues.push(...projection.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`));
    } catch (error) {
      return [(error as Error).message];
    }

    const nodeIds = new Set(projection.nodes.map((node) => node.id));
    const objectiveRevisions = new Set<number>();
    const objectiveDirectory = await safePath(await this.searchDirectory(searchId), "objectives");
    for (const entry of await readdir(objectiveDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const objective = await readJson<ObjectiveRecord>(await safePath(objectiveDirectory, entry.name));
        this.schemas.validate("objective", objective);
        const expectedName = `rev_${String(objective.revision).padStart(4, "0")}.json`;
        if (entry.name !== expectedName || objective.searchId !== searchId) {
          issues.push(`objectives/${entry.name}: objective identity does not match its canonical path`);
        }
        objectiveRevisions.add(objective.revision);
      } catch (error) {
        issues.push(`objectives/${entry.name}: ${(error as Error).message}`);
      }
    }

    for (const node of projection.nodes) {
      if (!objectiveRevisions.has(node.objectiveRevision)) {
        issues.push(`${node.id}: missing objective revision ${node.objectiveRevision}`);
      }
      if (node.edgeType === "root" && node.parents.length !== 0) {
        issues.push(`${node.id}: root nodes cannot have parents`);
      }
      if (node.edgeType === "root" && node.generation !== 0) {
        issues.push(`${node.id}: root nodes must be generation 0`);
      }
      if (node.edgeType !== "root" && node.parents.length === 0) {
        issues.push(`${node.id}: non-root nodes require a parent`);
      }
      if (node.edgeType === "crossover" && node.parents.length < 2) {
        issues.push(`${node.id}: crossover nodes require at least two parents`);
      }
      for (const parent of node.parents) {
        if (!nodeIds.has(parent)) issues.push(`${node.id}: missing parent ${parent}`);
      }
      const parentRecords = node.parents.map((parent) => projection.nodes.find((candidate) => candidate.id === parent)).filter(Boolean);
      if (parentRecords.length === node.parents.length && parentRecords.length > 0) {
        const expectedGeneration = Math.max(...parentRecords.map((parent) => parent!.generation)) + 1;
        if (node.generation !== expectedGeneration) {
          issues.push(`${node.id}: generation ${node.generation} should be ${expectedGeneration}`);
        }
      }
    }

    const highestSequence = Math.max(-1, ...projection.nodes.map((node) => Number(node.id.slice(2, 6))));
    if (projection.search.nextNodeSequence <= highestSequence) {
      issues.push(`search.json: nextNodeSequence must be greater than ${highestSequence}`);
    }

    for (const command of projection.commands) {
      for (const nodeId of command.nodeIds) {
        if (!nodeIds.has(nodeId)) issues.push(`${command.id}: missing command node ${nodeId}`);
      }
      for (const nodeId of command.result?.nodeIds ?? []) {
        if (!nodeIds.has(nodeId)) issues.push(`${command.id}: missing result node ${nodeId}`);
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const byId = new Map(projection.nodes.map((node) => [node.id, node]));
    const visit = (nodeId: string): void => {
      if (visiting.has(nodeId)) {
        issues.push(`${nodeId}: graph contains a cycle`);
        return;
      }
      if (visited.has(nodeId)) return;
      visiting.add(nodeId);
      for (const parent of byId.get(nodeId)?.parents ?? []) visit(parent);
      visiting.delete(nodeId);
      visited.add(nodeId);
    };
    for (const nodeId of nodeIds) visit(nodeId);
    return [...new Set(issues)];
  }

  async importStagedNode(searchId: string, stagingDirectory: string): Promise<NodeRecord> {
    const absoluteStaging = path.resolve(stagingDirectory);
    const allowedStagingRoot = path.join(this.root, ".search-for-fun", "staging");
    const relative = path.relative(allowedStagingRoot, absoluteStaging);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Staged nodes must live under .search-for-fun/staging");
    }
    await assertRealPathWithin(allowedStagingRoot, absoluteStaging);
    await validateStagingTree(absoluteStaging);
    const result = await readJson<ScoutResult>(path.join(absoluteStaging, "result.json"));
    this.schemas.validate("scout-result", result);
    const gameEntry = path.join(absoluteStaging, "game", "index.ts");
    if (!(await exists(gameEntry))) throw new Error("Staged node is missing game/index.ts");
    await validateGameSource(this.root, gameEntry);
    const files = await readdir(absoluteStaging, { withFileTypes: true });
    for (const file of files) {
      if (!new Set(["game", "result.json", "hypothesis.md"]).has(file.name)) {
        throw new Error(`Unexpected staged path: ${file.name}`);
      }
    }

    return withFileLock(this.lockPath(searchId), async () => {
      const searchDirectory = await this.searchDirectory(searchId);
      const search = await this.getSearchRecord(searchId);
      for (const parent of result.parents) await this.getNodeRecord(searchId, parent);
      const sequence = search.nextNodeSequence;
      const nodeId = `n_${String(sequence).padStart(4, "0")}_${slugify(result.title, "prototype")}`;
      const parentRecords = await Promise.all(result.parents.map((parent) => this.getNodeRecord(searchId, parent)));
      const generation = parentRecords.length === 0
        ? 0
        : Math.max(...parentRecords.map((parent) => parent.generation)) + 1;
      const timestamp = new Date().toISOString();
      const viewport = result.viewport ?? { width: 960, height: 540 };
      const node: NodeRecord = {
        schemaVersion: 1,
        id: nodeId,
        searchId,
        parents: result.parents,
        generation,
        edgeType: result.edgeType,
        searchRole: result.searchRole,
        lifecycleStatus: "sealed",
        objectiveRevision: search.activeObjectiveRevision,
        createdAt: timestamp,
        sealedAt: timestamp,
        title: result.title,
        hypothesis: result.hypothesis,
        changesFromParents: result.changesFromParents,
        preserve: result.preserve,
        provenance: { briefId: result.briefId, report: result.report },
        runtime: {
          entry: "game/index.ts",
          viewport,
          orientation: viewport.height > viewport.width ? "portrait" : "landscape",
          seed: result.seed ?? randomInt(0, 2_147_483_647),
          actions: result.actions,
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
      this.schemas.validate("node", node);

      const finalDirectory = await this.nodeDirectory(searchId, nodeId);
      const temporaryDirectory = await safePath(searchDirectory, "nodes", `.${nodeId}.${randomBytes(4).toString("hex")}.tmp`);
      try {
        await mkdir(temporaryDirectory, { recursive: true });
        await cp(path.join(absoluteStaging, "game"), path.join(temporaryDirectory, "game"), { recursive: true });
        const importedEntryPath = path.join(temporaryDirectory, "game", "index.ts");
        const importedEntry = await readFile(importedEntryPath, "utf8");
        const stagedIdPattern = /id\s*:\s*(["'])staged\1/;
        if (!stagedIdPattern.test(importedEntry)) {
          throw new Error('Staged game must declare the exact placeholder id: "staged"');
        }
        await atomicWriteText(importedEntryPath, importedEntry.replace(stagedIdPattern, `id: ${JSON.stringify(nodeId)}`));
        await atomicWriteJson(path.join(temporaryDirectory, "node.json"), node);
        const hypothesis = (await exists(path.join(absoluteStaging, "hypothesis.md")))
          ? await readFile(path.join(absoluteStaging, "hypothesis.md"), "utf8")
          : `# ${node.title}\n\n${node.hypothesis}\n`;
        await atomicWriteText(path.join(temporaryDirectory, "hypothesis.md"), hypothesis);
        await moveAtomically(temporaryDirectory, finalDirectory);
      } catch (error) {
        await rm(temporaryDirectory, { recursive: true, force: true });
        throw error;
      }

      search.nextNodeSequence += 1;
      search.updatedAt = timestamp;
      await atomicWriteJson(await safePath(searchDirectory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "node_imported", {
        nodeId,
        parents: node.parents,
        edgeType: node.edgeType,
      });
      await this.appendEventUnlocked(searchId, "node_sealed", { nodeId });
      return node;
    });
  }

  async claimPendingCommand(searchId: string, commandId: string): Promise<CommandRecord> {
    assertCommandId(commandId);
    return withFileLock(this.lockPath(searchId), async () => {
      const directory = await this.searchDirectory(searchId);
      const source = await safePath(directory, "commands", "pending", `${commandId}.json`);
      const destination = await safePath(directory, "commands", "processing", `${commandId}.json`);
      await mkdir(path.dirname(destination), { recursive: true });
      const command = await readJson<CommandRecord>(source);
      this.schemas.validate("command", command);
      if (command.id !== commandId || command.searchId !== searchId || command.status !== "pending") {
        throw new Error("Pending command identity or state is invalid");
      }
      command.status = "processing";
      await atomicWriteJson(source, command);
      await moveAtomically(source, destination);
      await this.appendEventUnlocked(searchId, "command_claimed", { commandId });
      return command;
    });
  }

  async completeCommand(
    searchId: string,
    commandId: string,
    result: NonNullable<CommandRecord["result"]>,
  ): Promise<CommandRecord> {
    assertCommandId(commandId);
    await Promise.all(result.nodeIds.map((nodeId) => this.getNodeRecord(searchId, nodeId)));
    return withFileLock(this.lockPath(searchId), async () => {
      const directory = await this.searchDirectory(searchId);
      const source = await safePath(directory, "commands", "processing", `${commandId}.json`);
      const destination = await safePath(directory, "commands", "processed", `${commandId}.json`);
      await mkdir(path.dirname(destination), { recursive: true });
      const command = await readJson<CommandRecord>(source);
      this.schemas.validate("command", command);
      if (command.id !== commandId || command.searchId !== searchId || command.status !== "processing") {
        throw new Error("Processing command identity or state is invalid");
      }
      command.status = "processed";
      command.result = result;
      this.schemas.validate("command", command);
      await atomicWriteJson(source, command);
      await moveAtomically(source, destination);
      const search = await this.getSearchRecord(searchId);
      search.updatedAt = result.completedAt > search.updatedAt ? result.completedAt : search.updatedAt;
      if (command.type === "select") {
        search.status = "selected";
        search.phase = "candidate";
      }
      await atomicWriteJson(await safePath(directory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "command_completed", {
        commandId,
        nodeIds: result.nodeIds,
      });
      if (command.type === "select") {
        await this.appendEventUnlocked(searchId, "candidate_selected", { nodeIds: command.nodeIds });
      }
      return command;
    });
  }

  async failCommand(searchId: string, commandId: string, reason: string): Promise<CommandRecord> {
    assertCommandId(commandId);
    const errorMessage = reason.trim();
    if (!errorMessage) throw new Error("Command failure requires a reason");
    return withFileLock(this.lockPath(searchId), async () => {
      const directory = await this.searchDirectory(searchId);
      const source = await safePath(directory, "commands", "processing", `${commandId}.json`);
      const destination = await safePath(directory, "commands", "processed", `${commandId}.json`);
      await mkdir(path.dirname(destination), { recursive: true });
      const command = await readJson<CommandRecord>(source);
      this.schemas.validate("command", command);
      if (command.id !== commandId || command.searchId !== searchId || command.status !== "processing") {
        throw new Error("Processing command identity or state is invalid");
      }
      command.status = "error";
      command.error = errorMessage.slice(0, 4000);
      this.schemas.validate("command", command);
      await atomicWriteJson(source, command);
      await moveAtomically(source, destination);
      const failedAt = new Date().toISOString();
      const search = await this.getSearchRecord(searchId);
      search.updatedAt = failedAt;
      await atomicWriteJson(await safePath(directory, "search.json"), search);
      await this.appendEventUnlocked(searchId, "command_failed", { commandId, reason: command.error });
      return command;
    });
  }
}
