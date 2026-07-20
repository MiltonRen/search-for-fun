import type { KAPLAYCtx } from "kaplay";
import type { JsonValue } from "../shared/types.js";

export interface PlaytestApi {
  ready(): void;
  start(): void;
  event(name: string, properties?: Record<string, JsonValue>): void;
  fail(reason?: string): void;
  complete(properties?: Record<string, JsonValue>): void;
  restart(): void;
}

export interface NodeRuntimeContext {
  searchId: string;
  nodeId: string;
  seed: number;
  runId: number;
  assetUrl(relativePath: string): string;
}

export type NodeCleanup = () => void | Promise<void>;

export interface SearchForFunGame {
  id: string;
  title: string;
  instructions: string;
  mount(
    k: KAPLAYCtx,
    playtest: PlaytestApi,
    runtime: NodeRuntimeContext,
  ): void | NodeCleanup | Promise<void | NodeCleanup>;
}

export const RUNTIME_PROTOCOL_VERSION = 1 as const;

export type RuntimeEventName =
  | "ready"
  | "started"
  | "telemetry"
  | "completed"
  | "failed"
  | "close_requested"
  | "restart_requested"
  | "restarted"
  | "error"
  | "screenshot"
  | "teardown_complete";

export interface RuntimeMessage {
  kind: "sff:runtime";
  protocol: typeof RUNTIME_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  nodeId: string;
  runId: number;
  event: RuntimeEventName;
  atMs: number;
  name?: string;
  properties?: Record<string, JsonValue>;
  reason?: string;
  dataUrl?: string;
}

export type RuntimeControlAction = "restart" | "screenshot" | "teardown" | "focus";

export interface RuntimeControlMessage {
  kind: "sff:control";
  protocol: typeof RUNTIME_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  action: RuntimeControlAction;
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<RuntimeMessage>;
  return (
    message.kind === "sff:runtime" &&
    message.protocol === RUNTIME_PROTOCOL_VERSION &&
    typeof message.sessionId === "string" &&
    typeof message.nonce === "string" &&
    typeof message.nodeId === "string" &&
    typeof message.runId === "number" && Number.isInteger(message.runId) && message.runId >= 0 &&
    typeof message.event === "string" &&
    ["ready", "started", "telemetry", "completed", "failed", "close_requested", "restart_requested", "restarted", "error", "screenshot", "teardown_complete"].includes(message.event) &&
    typeof message.atMs === "number" && Number.isFinite(message.atMs) && message.atMs >= 0 &&
    (message.name === undefined || typeof message.name === "string") &&
    (message.reason === undefined || typeof message.reason === "string") &&
    (message.dataUrl === undefined || typeof message.dataUrl === "string") &&
    (message.properties === undefined || (
      typeof message.properties === "object" && message.properties !== null && !Array.isArray(message.properties)
    ))
  );
}

export function isRuntimeControlMessage(value: unknown): value is RuntimeControlMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<RuntimeControlMessage>;
  return (
    message.kind === "sff:control" &&
    message.protocol === RUNTIME_PROTOCOL_VERSION &&
    typeof message.sessionId === "string" &&
    typeof message.nonce === "string" &&
    ["restart", "screenshot", "teardown", "focus"].includes(message.action ?? "")
  );
}
