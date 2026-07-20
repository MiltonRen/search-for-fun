import { useCallback, useEffect, useMemo, useState } from "react";
import type { CommandType, NodeProjection, SearchListItem, SearchProjection } from "../shared/types";
import {
  fetchSearch,
  fetchSearches,
  fetchSessionToken,
  queueCommand,
  saveEvaluation,
  type EvaluationPayload,
} from "./api";
import { EvaluationPanel } from "./evaluation-panel";
import { ExplorationGraph } from "./graph";
import { PlayerFrame, type LivePlaySession } from "./player-frame";
import { buildCodexResumeLink } from "./codex-link";

type Notice = { kind: "success" | "error"; message: string };

function nodeRoleLabel(node: NodeProjection): string {
  return node.searchRole.replaceAll("_", " ");
}

function commandDefault(count: number): CommandType {
  return count > 1 ? "cross" : "expand";
}

function resumeLink(projection: SearchProjection): string {
  return buildCodexResumeLink({
    workspacePath: projection.workspacePath,
    searchId: projection.search.id,
    codexThreadId: projection.search.codexThreadId,
  });
}

export function App() {
  const [searches, setSearches] = useState<SearchListItem[]>([]);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [projection, setProjection] = useState<SearchProjection | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draftNodeIds, setDraftNodeIds] = useState<Set<string>>(new Set());
  const [token, setToken] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<LivePlaySession | null>(null);
  const [restartSignal, setRestartSignal] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [commandType, setCommandType] = useState<CommandType>("expand");
  const [commandInstruction, setCommandInstruction] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refreshSearchList = useCallback(async () => {
    const list = await fetchSearches();
    setSearches(list);
    return list;
  }, []);

  const refreshProjection = useCallback(async (targetId = searchId) => {
    if (!targetId) return;
    const next = await fetchSearch(targetId);
    setProjection(next);
    setSelectedNodeId((current) => current && next.nodes.some((node) => node.id === current) ? current : null);
  }, [searchId]);

  const handleArtifactUpdated = useCallback(() => {
    if (searchId) void refreshProjection(searchId);
  }, [refreshProjection, searchId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchSessionToken(), refreshSearchList()])
      .then(([sessionToken, list]) => {
        if (cancelled) return;
        setToken(sessionToken);
        const fromUrl = new URLSearchParams(window.location.search).get("search");
        setSearchId(list.some((search) => search.id === fromUrl) ? fromUrl : list[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not load studio" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshSearchList]);

  useEffect(() => {
    if (!searchId) {
      setProjection(null);
      return;
    }
    setLoading(true);
    setSelectedNodeId(null);
    setLiveSession(null);
    setDraftNodeIds(new Set());
    setCompareMode(false);
    const url = new URL(window.location.href);
    url.searchParams.set("search", searchId);
    window.history.replaceState({}, "", url);
    void refreshProjection(searchId)
      .catch((error: unknown) => setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not load search" }))
      .finally(() => setLoading(false));
    const poller = window.setInterval(() => {
      void refreshProjection(searchId).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(poller);
  }, [refreshProjection, searchId]);

  useEffect(() => {
    setLiveSession(null);
    setRestartSignal(0);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    setCommandType(commandDefault(draftNodeIds.size));
    if (draftNodeIds.size < 2) setCompareMode(false);
  }, [draftNodeIds.size]);

  const selectedNode = useMemo(
    () => projection?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [projection, selectedNodeId],
  );
  const draftedNodes = useMemo(
    () => projection?.nodes.filter((node) => draftNodeIds.has(node.id)) ?? [],
    [draftNodeIds, projection],
  );
  const pendingCommands = projection?.commands.filter((command) => command.status === "pending").length ?? 0;

  const toggleDraft = (nodeId: string) => {
    setDraftNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleEvaluation = async (payload: EvaluationPayload) => {
    if (!projection || !token) return;
    setSaving(true);
    try {
      await saveEvaluation(projection.search.id, token, payload);
      await refreshProjection(projection.search.id);
      setNotice({ kind: "success", message: "Feedback saved." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not save feedback" });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleQueueCommand = async () => {
    if (!projection || !token || draftNodeIds.size === 0) return;
    const nodeIds = [...draftNodeIds];
    const mode = commandType === "cross" ? "crossover" : nodeIds.length > 1 ? "parallel" : "single";
    setSaving(true);
    try {
      await queueCommand(projection.search.id, token, {
        type: commandType,
        nodeIds,
        mode,
        instruction: commandInstruction.trim(),
      });
      setDraftNodeIds(new Set());
      setCommandInstruction("");
      setCompareMode(false);
      await refreshProjection(projection.search.id);
      setNotice({ kind: "success", message: "Next move queued for Codex." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not queue command" });
    } finally {
      setSaving(false);
    }
  };

  const queueDisposition = async (type: "favorite" | "archive" | "reject" | "select") => {
    if (!projection || !selectedNode || !token) return;
    setSaving(true);
    try {
      await queueCommand(projection.search.id, token, {
        type,
        nodeIds: [selectedNode.id],
        mode: "single",
        instruction: type === "reject" ? "Preserve the rejection rationale from the latest evaluation." : "",
      });
      await refreshProjection(projection.search.id);
      setNotice({ kind: "success", message: `${selectedNode.title} marked ${type}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not update branch" });
    } finally {
      setSaving(false);
    }
  };

  const closeNode = useCallback(() => {
    setSelectedNodeId(null);
    setCompareMode(false);
    setLiveSession(null);
  }, []);

  useEffect(() => {
    if (!selectedNodeId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.repeat) return;
      event.preventDefault();
      closeNode();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeNode, selectedNodeId]);

  const toggleCompare = () => {
    if (draftedNodes.length !== 2) return;
    if (!compareMode && !selectedNodeId) setSelectedNodeId(draftedNodes[0]!.id);
    setCompareMode((current) => !current);
  };

  if (!loading && searches.length === 0) {
    return (
      <main className="welcome-screen">
        <div className="welcome-mark" aria-hidden="true"><span /><span /><span /></div>
        <span className="eyebrow">Local design search</span>
        <h1>Find the fun.<br />Keep the evidence.</h1>
        <p>There are no searches in this repository yet. Start one with Codex, then use this map to play every branch.</p>
        <code>$search-for-fun Start: a one-button game about…</code>
      </main>
    );
  }

  return (
    <div className={`app-shell ${selectedNode ? "node-open" : ""}`}>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Search-for-fun home">
          <span className="brand-glyph" aria-hidden="true"><i /><i /><i /></span>
          <span>SEARCH <b>FOR FUN</b></span>
        </a>
        <div className="search-identity">
          <label htmlFor="search-picker">Search</label>
          <select id="search-picker" value={searchId ?? ""} onChange={(event) => setSearchId(event.target.value)}>
            {searches.map((search) => <option key={search.id} value={search.id}>{search.title}</option>)}
          </select>
        </div>
        <div className="header-objective">
          <span className="eyebrow">Looking for</span>
          <strong>{projection?.objective.desiredFeeling.join(" · ") ?? "Loading objective"}</strong>
        </div>
        <div className="header-status">
          <span className="node-total">{projection?.nodes.length ?? 0} nodes</span>
          {projection && pendingCommands === 0 && (
            <a className="codex-link" href={resumeLink(projection)}>
              Resume in Codex
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </header>

      {projection && projection.diagnostics.length > 0 && (
        <div className="diagnostic-banner" role="status">
          {projection.diagnostics.length} malformed artifact{projection.diagnostics.length === 1 ? " was" : "s were"} isolated. Healthy branches remain playable.
        </div>
      )}

      <main className={`map-workspace ${draftNodeIds.size > 0 ? "has-command" : ""}`} aria-busy={loading}>
        {projection && (
          <ExplorationGraph
            nodes={projection.nodes}
            objective={projection.objective}
            selectedNodeId={selectedNodeId}
            draftNodeIds={draftNodeIds}
            onSelect={setSelectedNodeId}
            onToggleDraft={toggleDraft}
          />
        )}

        {loading && <div className="map-loading" role="status"><span className="status-orbit" />Loading map…</div>}

        {selectedNode && (
          <section className={`node-expansion ${compareMode ? "compare-active" : ""}`} aria-label={`${selectedNode.title} expanded`}>
            <button className="close-expansion" aria-keyshortcuts="Escape" title="Close (Esc)" onClick={closeNode}><span aria-hidden="true">←</span> Map</button>

            <aside className="node-explainer">
              <div className="node-title-block">
                <span className="node-role">{nodeRoleLabel(selectedNode)}</span>
                <h1>{selectedNode.title}</h1>
                <span>{selectedNode.id} · generation {selectedNode.generation}</span>
              </div>

              <div className="explain-block">
                <span className="eyebrow">Testing</span>
                <p>{selectedNode.hypothesis}</p>
              </div>

              {selectedNode.changesFromParents.length > 0 && (
                <div className="explain-block">
                  <span className="eyebrow">What changed</span>
                  <ul>{selectedNode.changesFromParents.slice(0, 3).map((change) => <li key={change}>{change}</li>)}</ul>
                </div>
              )}

              <div className="node-facts">
                <span><b>Controls</b>{selectedNode.runtime.actions.filter((action) => action !== "restart").join(" · ")}</span>
                <span><b>Playtests</b>{selectedNode.evaluations.length}</span>
              </div>

              <div className="node-actions">
                <button onClick={() => setRestartSignal((value) => value + 1)}><span aria-hidden="true">↻</span> Restart</button>
                <button
                  aria-pressed={selectedNode.effectiveState.favorite}
                  className={selectedNode.effectiveState.favorite ? "active" : ""}
                  disabled={selectedNode.effectiveState.favorite || saving}
                  onClick={() => void queueDisposition("favorite")}
                ><span aria-hidden="true">★</span> Favorite</button>
              </div>

              <details className="more-actions">
                <summary>More branch actions</summary>
                <div>
                  <button disabled={selectedNode.effectiveState.selected || saving} onClick={() => void queueDisposition("select")}>{selectedNode.effectiveState.selected ? "Candidate selected" : "Select candidate"}</button>
                  <button disabled={selectedNode.effectiveState.rejected || saving} onClick={() => void queueDisposition("reject")}>{selectedNode.effectiveState.rejected ? "Direction rejected" : "Reject direction"}</button>
                  <button disabled={selectedNode.effectiveState.archived || saving} onClick={() => void queueDisposition("archive")}>{selectedNode.effectiveState.archived ? "Archived from map" : "Archive from map"}</button>
                </div>
              </details>
            </aside>

            <section className="game-cell" aria-label="Prototype player">
              <div className="game-cell-heading">
                <span>{compareMode ? "Side-by-side" : "Playable prototype"}</span>
                <span>{compareMode ? "Two selected branches" : `${selectedNode.runtime.viewport.width} × ${selectedNode.runtime.viewport.height}`}</span>
              </div>
              {compareMode && draftedNodes.length === 2 ? (
                <div className="compare-grid">
                  {draftedNodes.map((node) => (
                    <div className="compare-player" key={node.id}>
                      <span>{node.title}</span>
                      <PlayerFrame node={node} token={token} restartSignal={restartSignal} compact onArtifactUpdated={handleArtifactUpdated} onCloseRequest={closeNode} />
                    </div>
                  ))}
                </div>
              ) : (
                <PlayerFrame
                  key={selectedNode.id}
                  node={selectedNode}
                  token={token}
                  restartSignal={restartSignal}
                  onSessionChange={setLiveSession}
                  onArtifactUpdated={handleArtifactUpdated}
                  onCloseRequest={closeNode}
                />
              )}
            </section>

            <EvaluationPanel
              node={selectedNode}
              session={liveSession}
              saving={saving}
              selectedForNextMove={draftNodeIds.has(selectedNode.id)}
              onToggleNextMove={() => toggleDraft(selectedNode.id)}
              onSave={handleEvaluation}
            />
          </section>
        )}

        {draftNodeIds.size > 0 && (
          <form
            className="command-dock"
            aria-label="Next search move"
            onSubmit={(event) => {
              event.preventDefault();
              void handleQueueCommand();
            }}
          >
            <div className="command-count"><b>{draftNodeIds.size}</b><span>selected</span></div>
            <div className="command-tabs" role="radiogroup" aria-label="Next move type">
              <button type="button" role="radio" aria-checked={commandType === "expand"} className={commandType === "expand" ? "active" : ""} onClick={() => setCommandType("expand")}>Expand</button>
              <button type="button" role="radio" aria-checked={commandType === "cross"} className={commandType === "cross" ? "active" : ""} disabled={draftNodeIds.size < 2} onClick={() => setCommandType("cross")}>Cross</button>
              <button type="button" role="radio" aria-checked={commandType === "leap"} className={commandType === "leap" ? "active" : ""} onClick={() => setCommandType("leap")}>Leap</button>
            </div>
            <input
              aria-label="Instruction for the next move"
              value={commandInstruction}
              onChange={(event) => setCommandInstruction(event.target.value)}
              placeholder={commandType === "cross" ? "What should survive from each?" : "Preserve or change…"}
              maxLength={4000}
            />
            <button type="button" className="secondary-button" aria-pressed={compareMode} disabled={draftNodeIds.size !== 2} onClick={toggleCompare}>{compareMode ? "Stop compare" : "Compare"}</button>
            <button type="submit" className="primary-button" disabled={saving || (commandType === "cross" && draftNodeIds.size < 2)}>Queue <span aria-hidden="true">→</span></button>
            <button type="button" className="clear-flags" aria-label="Clear selection" onClick={() => setDraftNodeIds(new Set())}>×</button>
          </form>
        )}

        {draftNodeIds.size === 0 && pendingCommands > 0 && (
          <div className="pending-codex-bar" role="status">
            <strong>Now ask Codex to continue the search!</strong>
            <span>{pendingCommands} pending {pendingCommands === 1 ? "task" : "tasks"}</span>
          </div>
        )}
      </main>

      {notice && <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</div>}
    </div>
  );
}
