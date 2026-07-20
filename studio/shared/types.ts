export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SearchStatus = "exploring" | "narrowing" | "selected" | "archived";
export type SearchPhase = "exploration" | "narrowing" | "candidate";
export type SuccessMode = "joy" | "portfolio" | "commercial" | "learning" | "custom";

export interface SearchRecord {
  schemaVersion: 1;
  id: string;
  title: string;
  status: SearchStatus;
  phase: SearchPhase;
  createdAt: string;
  updatedAt: string;
  engine: {
    name: "kaplay";
    version: "4000.0.0-alpha.27.1";
  };
  codexThreadId?: string;
  activeObjectiveRevision: number;
  nextNodeSequence: number;
}

export interface ObjectiveRecord {
  schemaVersion: 1;
  searchId: string;
  revision: number;
  createdAt: string;
  successMode: SuccessMode;
  fantasy: string;
  desiredFeeling: string[];
  sessionLengthSeconds: [number, number];
  constraints: string[];
  rubric: string[];
  referenceGames?: string[];
  avoidPatterns?: string[];
  innovationTarget?: "familiar" | "balanced" | "experimental";
}

export type EdgeType =
  | "root"
  | "refine"
  | "branch"
  | "leap"
  | "crossover"
  | "reframe"
  | "art-study"
  | "system-study";

export type SearchRole = "readable" | "adjacent" | "leap" | "refinement" | "crossover" | "study";

export interface NodeRecord {
  schemaVersion: 1;
  id: string;
  searchId: string;
  parents: string[];
  generation: number;
  edgeType: EdgeType;
  searchRole: SearchRole;
  lifecycleStatus: "sealed";
  objectiveRevision: number;
  createdAt: string;
  sealedAt: string;
  title: string;
  hypothesis: string;
  changesFromParents: string[];
  preserve: string[];
  provenance: {
    briefId: string;
    report: string;
  };
  runtime: {
    entry: "game/index.ts";
    viewport: { width: number; height: number };
    orientation: "landscape" | "portrait" | "square";
    seed: number;
    actions: string[];
  };
  validation: {
    schema: "passed";
    typecheck: "passed";
    bundle: "passed";
    boot: "pending" | "passed" | "failed";
    consoleErrors: number;
    screenshot: "pending" | "preview.png";
  };
}

export type EvaluationType = "human_playtest" | "behavioral" | "technical" | "agent_critique";

export interface EvaluationRecord {
  schemaVersion: 1;
  id: string;
  type: EvaluationType;
  searchId: string;
  nodeId: string;
  objectiveRevision: number;
  createdAt: string;
  session: {
    id: string;
    durationSeconds: number;
    restarts: number;
    completed: boolean;
  };
  ratings: Record<string, number | null>;
  preserve: string;
  change: string;
  note: string;
  nextMove?: string;
  telemetry?: Array<{
    name: string;
    atMs: number;
    properties?: Record<string, JsonValue>;
  }>;
}

export type CommandType = "expand" | "cross" | "leap" | "archive" | "favorite" | "reject" | "select";
export type CommandStatus = "pending" | "processing" | "processed" | "error";

export interface CommandRecord {
  schemaVersion: 1;
  id: string;
  type: CommandType;
  searchId: string;
  nodeIds: string[];
  mode: "single" | "parallel" | "crossover";
  instruction: string;
  createdAt: string;
  createdBy: "studio" | "codex";
  status: CommandStatus;
  result?: {
    completedAt: string;
    nodeIds: string[];
    summary: string;
  };
  error?: string;
}

export interface SearchEvent {
  schemaVersion: 1;
  id: string;
  type:
    | "search_created"
    | "objective_revised"
    | "exploration_started"
    | "node_imported"
    | "node_sealed"
    | "node_validation_failed"
    | "evaluation_recorded"
    | "command_queued"
    | "command_claimed"
    | "command_completed"
    | "command_failed"
    | "candidate_selected"
    | "search_archived"
    | "preview_captured";
  searchId: string;
  createdAt: string;
  payload: Record<string, JsonValue>;
}

export interface EffectiveNodeState {
  favorite: boolean;
  archived: boolean;
  rejected: boolean;
  selected: boolean;
  pending: boolean;
}

export interface NodeProjection extends NodeRecord {
  previewUrl: string | null;
  playUrl: string;
  evaluations: EvaluationRecord[];
  effectiveState: EffectiveNodeState;
}

export interface SearchProjection {
  search: SearchRecord;
  objective: ObjectiveRecord;
  nodes: NodeProjection[];
  commands: CommandRecord[];
  events: SearchEvent[];
  workspacePath: string;
  diagnostics: Array<{ path: string; message: string }>;
}

export interface SearchListItem {
  id: string;
  title: string;
  status: SearchStatus;
  phase: SearchPhase;
  nodeCount: number;
  updatedAt: string;
}
