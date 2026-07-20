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

type Notice = { kind: "success" | "error"; message: string };

function nodeRoleLabel(node: NodeProjection): string {
  return node.searchRole.replaceAll("_", " ");
}

function commandDefaults(count: number): { type: CommandType; mode: "single" | "parallel" | "crossover" } {
  return count > 1
    ? { type: "cross", mode: "crossover" }
    : { type: "expand", mode: "single" };
}

function resumeLink(projection: SearchProjection): string {
  const prompt = `$search-for-fun Resume ${projection.search.id} and process the pending commands.`;
  return `codex://new?path=${encodeURIComponent(projection.workspacePath)}&prompt=${encodeURIComponent(prompt)}`;
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
    setSelectedNodeId((current) =>
      current && next.nodes.some((node) => node.id === current) ? current : next.nodes[0]?.id ?? null,
    );
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
        const initial = list.some((search) => search.id === fromUrl) ? fromUrl : list[0]?.id ?? null;
        setSearchId(initial);
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
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const defaults = commandDefaults(draftNodeIds.size);
    setCommandType(defaults.type);
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

  const handleEvaluation = async (payload: EvaluationPayload, flag: boolean) => {
    if (!projection || !token) return;
    setSaving(true);
    try {
      await saveEvaluation(projection.search.id, token, payload);
      if (flag) setDraftNodeIds((current) => new Set(current).add(payload.nodeId));
      await refreshProjection(projection.search.id);
      setNotice({ kind: "success", message: flag ? "Evidence saved and branch flagged." : "Playtest evidence saved." });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Could not save evaluation" });
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

  if (!loading && searches.length === 0) {
    return (
      <main className="welcome-screen">
        <div className="welcome-mark" aria-hidden="true"><span /><span /><span /></div>
        <span className="eyebrow">Local design search</span>
        <h1>Search for the game<br />before you build it.</h1>
        <p>There are no searches in this repository yet. Start from Codex, then this studio becomes the playable map of everything you learn.</p>
        <code>$search-for-fun Start: a one-button game about…</code>
        <div className="welcome-steps">
          <span><b>01</b> Define depth</span>
          <span><b>02</b> Go wide</span>
          <span><b>03</b> Play + measure</span>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Search-for-fun home">
          <span className="brand-glyph" aria-hidden="true"><i /><i /><i /></span>
          <span>SEARCH<br /><b>FOR FUN</b></span>
        </a>
        <div className="search-identity">
          <label htmlFor="search-picker">Active search</label>
          <select id="search-picker" value={searchId ?? ""} onChange={(event) => setSearchId(event.target.value)}>
            {searches.map((search) => <option key={search.id} value={search.id}>{search.title}</option>)}
          </select>
          {projection && <span>{projection.search.id}</span>}
        </div>
        <div className="header-objective">
          <span className="eyebrow">Optimizing for</span>
          <strong>{projection?.objective.desiredFeeling.join(" · ") ?? "Loading objective"}</strong>
        </div>
        <div className="header-status">
          <span className={`phase phase-${projection?.search.phase ?? "exploration"}`}>{projection?.search.phase ?? "loading"}</span>
          {projection && (
            <a className="codex-link" href={resumeLink(projection)}>
              {pendingCommands > 0 ? `${pendingCommands} pending · Continue in Codex` : "Resume in Codex"}
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

      <main className="studio-layout" aria-busy={loading}>
        <div className="left-rail">
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

          <section className={`command-dock ${draftNodeIds.size > 0 ? "open" : ""}`} aria-label="Next search move">
            <div className="command-count"><b>{String(draftNodeIds.size).padStart(2, "0")}</b><span>branches<br />flagged</span></div>
            {draftNodeIds.size > 0 ? (
              <div className="command-body">
                <div className="command-tabs" role="radiogroup" aria-label="Next move type">
                  <button role="radio" aria-checked={commandType === "expand"} className={commandType === "expand" ? "active" : ""} onClick={() => setCommandType("expand")}>Expand</button>
                  <button role="radio" aria-checked={commandType === "cross"} className={commandType === "cross" ? "active" : ""} disabled={draftNodeIds.size < 2} onClick={() => setCommandType("cross")}>Cross</button>
                  <button role="radio" aria-checked={commandType === "leap"} className={commandType === "leap" ? "active" : ""} onClick={() => setCommandType("leap")}>Leap</button>
                </div>
                <textarea
                  aria-label="Instruction for the next move"
                  value={commandInstruction}
                  onChange={(event) => setCommandInstruction(event.target.value)}
                  placeholder={commandType === "cross" ? "What should survive from each parent?" : "What should the next experiment preserve or change?"}
                  maxLength={4000}
                />
                <div className="command-actions">
                  <button className="secondary-button" aria-pressed={compareMode} disabled={draftNodeIds.size !== 2} onClick={() => setCompareMode((current) => !current)}>
                    {compareMode ? "Exit compare" : "Compare"}
                  </button>
                  <button className="primary-button" onClick={() => void handleQueueCommand()} disabled={saving || (commandType === "cross" && draftNodeIds.size < 2)}>
                    Queue move <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            ) : (
              <p>Flag promising branches to compose the next experiment.</p>
            )}
          </section>
        </div>

        <section className="play-column" aria-label="Prototype player">
          {selectedNode ? (
            <>
              <div className="node-toolbar">
                <div className="node-heading">
                  <span className={`node-role role-${selectedNode.searchRole}`}>{nodeRoleLabel(selectedNode)}</span>
                  <div><h1>{selectedNode.title}</h1><span>{selectedNode.id} · generation {selectedNode.generation}</span></div>
                </div>
                <div className="node-actions">
                  <button aria-label="Restart prototype" onClick={() => setRestartSignal((value) => value + 1)} title="Restart prototype">↻ <span>Restart</span></button>
                  <button aria-pressed={draftNodeIds.has(selectedNode.id)} className={draftNodeIds.has(selectedNode.id) ? "active" : ""} onClick={() => toggleDraft(selectedNode.id)}>◆ <span>{draftNodeIds.has(selectedNode.id) ? "Flagged" : "Flag"}</span></button>
                  <button
                    aria-label={selectedNode.effectiveState.favorite ? "Favorite branch" : "Mark branch as favorite"}
                    aria-pressed={selectedNode.effectiveState.favorite}
                    className={selectedNode.effectiveState.favorite ? "active" : ""}
                    disabled={selectedNode.effectiveState.favorite}
                    onClick={() => void queueDisposition("favorite")}
                    title={selectedNode.effectiveState.favorite ? "Favorite" : "Mark as favorite"}
                  >★</button>
                  <details className="more-actions">
                    <summary aria-label="More branch actions">•••</summary>
                    <div>
                      <button disabled={selectedNode.effectiveState.selected} onClick={() => void queueDisposition("select")}>{selectedNode.effectiveState.selected ? "Candidate selected" : "Select candidate"}</button>
                      <button disabled={selectedNode.effectiveState.rejected} onClick={() => void queueDisposition("reject")}>{selectedNode.effectiveState.rejected ? "Direction rejected" : "Reject direction"}</button>
                      <button disabled={selectedNode.effectiveState.archived} onClick={() => void queueDisposition("archive")}>{selectedNode.effectiveState.archived ? "Archived from map" : "Archive from map"}</button>
                    </div>
                  </details>
                </div>
              </div>

              <div className={`play-stage ${compareMode ? "compare-stage" : ""}`}>
                {compareMode && draftedNodes.length === 2 ? (
                  draftedNodes.map((node) => (
                    <div className="compare-player" key={node.id}>
                      <span>{node.title}</span>
                      <PlayerFrame
                        node={node}
                        token={token}
                        restartSignal={restartSignal}
                        compact
                        onArtifactUpdated={handleArtifactUpdated}
                      />
                    </div>
                  ))
                ) : (
                  <PlayerFrame
                    key={selectedNode.id}
                    node={selectedNode}
                    token={token}
                    restartSignal={restartSignal}
                    onSessionChange={setLiveSession}
                    onArtifactUpdated={handleArtifactUpdated}
                  />
                )}
              </div>

              <div className="hypothesis-strip">
                <span className="eyebrow">Testing</span>
                <p>{selectedNode.hypothesis}</p>
                <span className="instructions">{selectedNode.runtime.actions.join(" + ")} input</span>
              </div>
            </>
          ) : (
            <div className="no-node"><span className="status-orbit" /><h2>No playable nodes yet</h2><p>Continue the search in Codex to create the first three experiments.</p></div>
          )}
        </section>

        <EvaluationPanel
          node={selectedNode}
          objective={projection?.objective ?? null}
          session={liveSession}
          saving={saving}
          isFlagged={selectedNode ? draftNodeIds.has(selectedNode.id) : false}
          onSave={handleEvaluation}
        />
      </main>

      {notice && <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</div>}
    </div>
  );
}
