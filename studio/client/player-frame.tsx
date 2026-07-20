import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EvaluationRecord, NodeProjection } from "../shared/types";
import {
  RUNTIME_PROTOCOL_VERSION,
  isRuntimeMessage,
  type RuntimeControlAction,
  type RuntimeControlMessage,
} from "../runtime/contract";
import { recordRuntimeFailure, savePreview } from "./api";

export interface LivePlaySession {
  id: string;
  startedAt: number;
  restarts: number;
  completed: boolean;
  telemetry: NonNullable<EvaluationRecord["telemetry"]>;
}

interface PlayerFrameProps {
  node: NodeProjection;
  token: string | null;
  restartSignal: number;
  compact?: boolean;
  onSessionChange?(session: LivePlaySession): void;
  onArtifactUpdated?(): void;
  onCloseRequest?(): void;
}

function createSession(id = crypto.randomUUID()): LivePlaySession {
  return {
    id,
    startedAt: performance.now(),
    restarts: 0,
    completed: false,
    telemetry: [],
  };
}

export function PlayerFrame(props: PlayerFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const identity = useMemo(
    () => ({ sessionId: crypto.randomUUID(), nonce: crypto.randomUUID() }),
    [props.node.id],
  );
  const sessionRef = useRef<LivePlaySession>(createSession(identity.sessionId));
  const previewRequested = useRef(false);
  const failureReported = useRef(false);
  const previousRestartSignal = useRef(props.restartSignal);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const emitSession = useCallback(() => {
    props.onSessionChange?.({
      ...sessionRef.current,
      telemetry: [...sessionRef.current.telemetry],
    });
  }, [props.onSessionChange]);

  const sendControl = useCallback((action: RuntimeControlAction) => {
    const message: RuntimeControlMessage = {
      kind: "sff:control",
      protocol: RUNTIME_PROTOCOL_VERSION,
      sessionId: sessionRef.current.id,
      nonce: identity.nonce,
      action,
    };
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, [identity.nonce]);

  const reportFailure = useCallback((reason: string) => {
    if (!props.token || failureReported.current) return;
    failureReported.current = true;
    void recordRuntimeFailure(props.node.searchId, props.node.id, props.token, reason)
      .then(() => props.onArtifactUpdated?.())
      .catch(() => { failureReported.current = false; });
  }, [props.node.id, props.node.searchId, props.onArtifactUpdated, props.token]);

  useEffect(() => {
    sessionRef.current = createSession(identity.sessionId);
    previewRequested.current = false;
    failureReported.current = false;
    setStatus("loading");
    setError(null);
    emitSession();
  }, [props.node.id, identity.sessionId, emitSession]);

  useEffect(() => {
    if (props.restartSignal === previousRestartSignal.current) return;
    previousRestartSignal.current = props.restartSignal;
    sessionRef.current.restarts += 1;
    emitSession();
    sendControl("restart");
  }, [props.restartSignal, emitSession, sendControl]);

  useEffect(() => {
    if (status !== "loading") return;
    const timeout = window.setTimeout(() => {
      setStatus("error");
      const reason = "The prototype did not report ready within eight seconds.";
      setError(reason);
      reportFailure(reason);
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [identity.sessionId, reportFailure, status]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !isRuntimeMessage(event.data)) return;
      const message = event.data;
      if (
        message.sessionId !== sessionRef.current.id ||
        message.nonce !== identity.nonce ||
        message.nodeId !== props.node.id
      ) return;

      if (message.event === "close_requested") {
        props.onCloseRequest?.();
        return;
      }

      if (message.event === "ready") {
        setStatus("ready");
        setError(null);
        if (!props.node.previewUrl && props.token && !previewRequested.current) {
          previewRequested.current = true;
          window.setTimeout(() => sendControl("screenshot"), 250);
        }
      }
      if (message.event === "telemetry" && message.name) {
        sessionRef.current.telemetry.push({
          name: message.name,
          atMs: message.atMs,
          ...(message.properties ? { properties: message.properties } : {}),
        });
        if (sessionRef.current.telemetry.length > 500) sessionRef.current.telemetry.shift();
        emitSession();
      }
      if (message.event === "completed") {
        sessionRef.current.completed = true;
        emitSession();
      }
      if (message.event === "failed") {
        sessionRef.current.telemetry.push({
          name: "run_failed",
          atMs: message.atMs,
          ...(message.reason ? { properties: { reason: message.reason } } : {}),
        });
        emitSession();
      }
      if (message.event === "restart_requested") {
        sessionRef.current.restarts += 1;
        emitSession();
        sendControl("restart");
      }
      if (message.event === "error") {
        setStatus("error");
        const reason = message.reason ?? "The prototype stopped unexpectedly.";
        setError(reason);
        reportFailure(reason);
      }
      if (message.event === "screenshot" && message.dataUrl && props.token) {
        void savePreview(props.node.searchId, props.node.id, props.token, message.dataUrl)
          .then(() => props.onArtifactUpdated?.())
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Could not save preview");
          });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [emitSession, identity.nonce, props.node.id, props.node.previewUrl, props.node.searchId, props.onArtifactUpdated, props.onCloseRequest, props.token, reportFailure, sendControl]);

  useEffect(() => () => sendControl("teardown"), [identity.sessionId, sendControl]);

  const source = `${props.node.playUrl}?session=${encodeURIComponent(identity.sessionId)}&nonce=${encodeURIComponent(identity.nonce)}`;

  return (
    <div className={`player-frame ${props.compact ? "compact" : ""}`}>
      <iframe
        ref={iframeRef}
        src={source}
        title={`Play ${props.node.title}`}
        sandbox="allow-scripts"
        allow="gamepad"
        onPointerDown={() => sendControl("focus")}
      />
      {status !== "ready" && (
        <div className={`player-status ${status}`} role={status === "error" ? "alert" : "status"}>
          <span className="status-orbit" aria-hidden="true" />
          <strong>{status === "error" ? "Prototype interrupted" : "Launching experiment"}</strong>
          <span>{error ?? (status === "loading" ? "Building a fresh runtime…" : "")}</span>
        </div>
      )}
      {status === "ready" && error && <div className="player-warning" role="alert">Preview not saved: {error}</div>}
    </div>
  );
}
