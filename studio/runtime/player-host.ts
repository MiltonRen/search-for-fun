import type { KAPLAYCtx } from "kaplay";
import {
  RUNTIME_PROTOCOL_VERSION,
  isRuntimeControlMessage,
  type NodeCleanup,
  type NodeRuntimeContext,
  type PlaytestApi,
  type RuntimeMessage,
  type SearchForFunGame,
} from "./contract.js";
import { createKaplayRuntime } from "./create-kaplay-runtime.js";
import type { JsonValue } from "../shared/types.js";

export interface BootstrapOptions {
  searchId: string;
  nodeId: string;
  seed: number;
  viewport: { width: number; height: number };
}

interface ActiveRun {
  k: KAPLAYCtx;
  cleanup?: NodeCleanup;
}

function safeProperties(value?: Record<string, JsonValue>): Record<string, JsonValue> | undefined {
  if (!value) return undefined;
  const serialized = JSON.stringify(value);
  if (serialized.length > 16_384) throw new Error("Telemetry properties exceed 16 KB");
  return JSON.parse(serialized) as Record<string, JsonValue>;
}

export function bootstrapNode(game: SearchForFunGame, options: BootstrapOptions): void {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session") ?? "missing-session";
  const nonce = params.get("nonce") ?? "missing-nonce";
  const startedAt = performance.now();
  let runId = 0;
  let active: ActiveRun | undefined;
  let ready = false;
  let tearingDown = false;

  if (game.id !== options.nodeId) {
    throw new Error(`Game module ID ${game.id} does not match ${options.nodeId}`);
  }

  const post = (message: Omit<RuntimeMessage, "kind" | "protocol" | "sessionId" | "nonce" | "nodeId" | "runId" | "atMs">): void => {
    const payload: RuntimeMessage = {
      kind: "sff:runtime",
      protocol: RUNTIME_PROTOCOL_VERSION,
      sessionId,
      nonce,
      nodeId: options.nodeId,
      runId,
      atMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...message,
    };
    window.parent.postMessage(payload, "*");
  };

  const makeApi = (): PlaytestApi => ({
    ready() {
      if (ready) return;
      ready = true;
      requestAnimationFrame(() => requestAnimationFrame(() => post({ event: "ready" })));
    },
    start() {
      post({ event: "started" });
    },
    event(name, properties) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) throw new Error(`Invalid telemetry event: ${name}`);
      post({ event: "telemetry", name, properties: safeProperties(properties) });
    },
    fail(reason) {
      post({ event: "failed", reason: reason?.slice(0, 1000) });
    },
    complete(properties) {
      post({ event: "completed", properties: safeProperties(properties) });
    },
    restart() {
      post({ event: "restart_requested" });
    },
  });

  const makeContext = (): NodeRuntimeContext => ({
    searchId: options.searchId,
    nodeId: options.nodeId,
    seed: options.seed,
    runId,
    assetUrl(relativePath) {
      if (!relativePath || relativePath.includes("..") || relativePath.startsWith("/") || relativePath.includes(":")) {
        throw new Error("Asset paths must be safe, relative paths");
      }
      const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
      return `/assets/${encodeURIComponent(options.searchId)}/${encodeURIComponent(options.nodeId)}/${encoded}`;
    },
  });

  const teardown = async (): Promise<void> => {
    if (!active) return;
    const current = active;
    active = undefined;
    try {
      await current.cleanup?.();
    } finally {
      current.k.quit();
      document.querySelector("canvas")?.remove();
    }
  };

  const boot = async (): Promise<void> => {
    ready = false;
    const canvas = document.createElement("canvas");
    canvas.id = "game";
    canvas.setAttribute("aria-label", game.title);
    canvas.tabIndex = 0;
    document.body.append(canvas);
    const k = createKaplayRuntime({ canvas, ...options.viewport });
    active = { k };
    const playtest = makeApi();
    k.onButtonPress("restart", () => playtest.restart());
    const cleanup = await game.mount(k, playtest, makeContext());
    if (typeof cleanup === "function" && active?.k === k) active.cleanup = cleanup;
    canvas.focus();
  };

  const restart = async (): Promise<void> => {
    await teardown();
    runId += 1;
    await boot();
    post({ event: "restarted" });
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !isRuntimeControlMessage(event.data)) return;
    if (event.data.sessionId !== sessionId || event.data.nonce !== nonce) return;

    if (event.data.action === "restart") void restart().catch(reportRuntimeError);
    if (event.data.action === "focus") document.querySelector("canvas")?.focus();
    if (event.data.action === "screenshot") {
      const dataUrl = active?.k.screenshot();
      if (dataUrl) post({ event: "screenshot", dataUrl });
    }
    if (event.data.action === "teardown") {
      tearingDown = true;
      void teardown().then(() => post({ event: "teardown_complete" })).catch(reportRuntimeError);
    }
  });

  const reportRuntimeError = (reason: unknown): void => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    post({ event: "error", reason: error.stack?.slice(0, 4000) ?? error.message.slice(0, 4000) });
  };

  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => {
    originalConsoleError(...values);
    const detail = values.map((value) => value instanceof Error ? value.stack ?? value.message : String(value)).join(" ");
    reportRuntimeError(new Error(`console.error: ${detail}`));
  };

  window.addEventListener("error", (event) => reportRuntimeError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportRuntimeError(event.reason));
  window.addEventListener("beforeunload", () => {
    console.error = originalConsoleError;
    if (!tearingDown) active?.k.quit();
  });

  void boot().catch(reportRuntimeError);
}
