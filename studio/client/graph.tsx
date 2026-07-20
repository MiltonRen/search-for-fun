import { useMemo, useState } from "react";
import type { NodeProjection, ObjectiveRecord } from "../shared/types";

interface ExplorationGraphProps {
  nodes: NodeProjection[];
  objective: ObjectiveRecord;
  selectedNodeId: string | null;
  draftNodeIds: Set<string>;
  onSelect(nodeId: string): void;
  onToggleDraft(nodeId: string): void;
}

interface PositionedNode {
  node: NodeProjection;
  x: number;
  y: number;
}

const NODE_WIDTH = 168;
const NODE_HEIGHT = 82;

function averageRating(node: NodeProjection): string {
  const values = node.evaluations.flatMap((evaluation) =>
    Object.values(evaluation.ratings).filter((value): value is number => typeof value === "number"),
  );
  if (!values.length) return "—";
  return (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1);
}

function roleLabel(node: NodeProjection): string {
  return node.searchRole.replaceAll("_", " ");
}

export function ExplorationGraph(props: ExplorationGraphProps) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const layout = useMemo(() => {
    const generations = new Map<number, NodeProjection[]>();
    for (const node of props.nodes) {
      const bucket = generations.get(node.generation) ?? [];
      bucket.push(node);
      generations.set(node.generation, bucket);
    }
    for (const bucket of generations.values()) bucket.sort((a, b) => a.id.localeCompare(b.id));
    const positioned: PositionedNode[] = [];
    let maxRows = 1;
    for (const [generation, bucket] of [...generations.entries()].sort(([left], [right]) => left - right)) {
      maxRows = Math.max(maxRows, bucket.length);
      bucket.forEach((node, index) => {
        positioned.push({ node, x: 250 + generation * 224, y: 36 + index * 112 });
      });
    }
    const byId = new Map(positioned.map((item) => [item.node.id, item]));
    const maxGeneration = Math.max(0, ...props.nodes.map((node) => node.generation));
    return {
      positioned,
      byId,
      width: Math.max(760, 250 + (maxGeneration + 1) * 224),
      height: Math.max(340, 60 + maxRows * 112),
    };
  }, [props.nodes]);

  return (
    <section className="graph-section" aria-label="Exploration graph">
      <div className="section-heading graph-heading">
        <div>
          <span className="eyebrow">Search map</span>
          <h2>Exploration</h2>
        </div>
        <div className="segmented-control" aria-label="Graph display">
          <button aria-pressed={view === "graph"} className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Map</button>
          <button aria-pressed={view === "list"} className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
        </div>
      </div>

      {view === "graph" ? (
        <div className="graph-scroll">
          <svg
            className="exploration-graph"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label={`${props.nodes.length} playable design branches`}
          >
            <g className="objective-node">
              <rect x="24" y={layout.height / 2 - 46} width="168" height="92" rx="18" />
              <text x="42" y={layout.height / 2 - 17} className="node-kicker">OBJECTIVE</text>
              <text x="42" y={layout.height / 2 + 8} className="node-title">
                {props.objective.fantasy.slice(0, 20)}{props.objective.fantasy.length > 20 ? "…" : ""}
              </text>
              <text x="42" y={layout.height / 2 + 30} className="node-meta">rev {props.objective.revision}</text>
            </g>

            <g className="graph-edges" aria-hidden="true">
              {layout.positioned.flatMap(({ node, x, y }) => {
                const targets = node.parents.length
                  ? node.parents.map((parent) => layout.byId.get(parent)).filter(Boolean) as PositionedNode[]
                  : [{ x: 24, y: layout.height / 2 - 46, node } as PositionedNode];
                return targets.map((parent, index) => {
                  const startX = node.parents.length ? parent.x + NODE_WIDTH : 192;
                  const startY = node.parents.length ? parent.y + NODE_HEIGHT / 2 : layout.height / 2;
                  const endX = x;
                  const endY = y + NODE_HEIGHT / 2;
                  const bend = Math.max(36, (endX - startX) * 0.48);
                  return (
                    <path
                      key={`${node.id}-${parent.node.id}-${index}`}
                      d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                      className={`edge edge-${node.edgeType}`}
                    />
                  );
                });
              })}
            </g>

            {layout.positioned.map(({ node, x, y }) => {
              const selected = props.selectedNodeId === node.id;
              const drafted = props.draftNodeIds.has(node.id);
              const stateClasses = [
                "graph-node",
                `role-${node.searchRole}`,
                selected ? "selected" : "",
                drafted ? "drafted" : "",
                node.effectiveState.rejected ? "rejected" : "",
                node.effectiveState.archived ? "archived" : "",
                node.validation.boot === "failed" ? "failed" : "",
              ].filter(Boolean).join(" ");
              return (
                <g
                  key={node.id}
                  className={stateClasses}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.title}, ${roleLabel(node)} branch${drafted ? ", flagged" : ""}${node.validation.boot === "failed" ? ", failed validation" : ""}`}
                  onClick={(event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) props.onToggleDraft(node.id);
                    else props.onSelect(node.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") props.onSelect(node.id);
                    if (event.key === " ") {
                      event.preventDefault();
                      props.onToggleDraft(node.id);
                    }
                  }}
                >
                  <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx="16" />
                  <circle cx={x + 18} cy={y + 19} r="5" className="role-dot" />
                  <text x={x + 31} y={y + 23} className="node-kicker">{roleLabel(node).toUpperCase()}</text>
                  <text x={x + 16} y={y + 49} className="node-title">
                    {node.title.slice(0, 21)}{node.title.length > 21 ? "…" : ""}
                  </text>
                  <text x={x + 16} y={y + 69} className="node-meta">G{node.generation} · {averageRating(node)} avg</text>
                  {drafted && <text x={x + 145} y={y + 23} className="flag-mark">◆</text>}
                  {node.effectiveState.favorite && <text x={x + 144} y={y + 68} className="favorite-mark">★</text>}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="node-list" role="list">
          {props.nodes.map((node) => (
            <div role="listitem" key={node.id}>
              <button
                className={`node-list-item ${props.selectedNodeId === node.id ? "selected" : ""} ${node.validation.boot === "failed" ? "failed" : ""}`}
                onClick={() => props.onSelect(node.id)}
              >
                <span className={`list-role role-${node.searchRole}`}>{roleLabel(node)}</span>
                <strong>{node.title}</strong>
                <span>{node.id}</span>
                <span>{node.evaluations.length} playtest{node.evaluations.length === 1 ? "" : "s"}</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="graph-hint">Select to play · Shift-click or Space to flag</p>
    </section>
  );
}
