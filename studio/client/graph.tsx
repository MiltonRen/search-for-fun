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

const NODE_WIDTH = 224;
const NODE_HEIGHT = 104;
const OBJECTIVE_WIDTH = 220;

function averageFun(node: NodeProjection): string {
  const values = node.evaluations
    .map((evaluation) => evaluation.ratings.fun)
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return "—";
  return (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1);
}

function roleLabel(node: NodeProjection): string {
  return node.searchRole.replaceAll("_", " ");
}

function shorten(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
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
        positioned.push({ node, x: 352 + generation * 304, y: 68 + index * 142 });
      });
    }
    const byId = new Map(positioned.map((item) => [item.node.id, item]));
    const maxGeneration = Math.max(0, ...props.nodes.map((node) => node.generation));
    return {
      positioned,
      byId,
      width: Math.max(1120, 352 + (maxGeneration + 1) * 304 + 72),
      height: Math.max(650, 130 + maxRows * 142),
    };
  }, [props.nodes]);

  return (
    <section className={`graph-section ${props.selectedNodeId ? "has-expansion" : ""}`} aria-label="Exploration map">
      <div className="graph-heading">
        <div>
          <span className="eyebrow">Search map</span>
        </div>
        <div className="segmented-control" aria-label="Map display">
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
            <defs>
              {layout.positioned.map(({ node, x, y }) => (
                <clipPath id={`preview-${node.id}`} key={node.id}>
                  <rect x={x + 10} y={y + 10} width="82" height="84" rx="11" />
                </clipPath>
              ))}
            </defs>

            <g className="objective-node">
              <rect x="60" y={layout.height / 2 - 56} width={OBJECTIVE_WIDTH} height="112" rx="22" />
              <text x="84" y={layout.height / 2 - 23} className="node-kicker">OBJECTIVE · REV {props.objective.revision}</text>
              <text x="84" y={layout.height / 2 + 7} className="objective-title">
                {shorten(props.objective.fantasy, 25)}
              </text>
              <text x="84" y={layout.height / 2 + 35} className="node-meta">
                {shorten(props.objective.desiredFeeling.join(" · "), 31)}
              </text>
            </g>

            <g className="graph-edges" aria-hidden="true">
              {layout.positioned.flatMap(({ node, x, y }) => {
                const targets = node.parents.length
                  ? node.parents.map((parent) => layout.byId.get(parent)).filter(Boolean) as PositionedNode[]
                  : [{ x: 60, y: layout.height / 2 - 56, node } as PositionedNode];
                return targets.map((parent, index) => {
                  const startX = node.parents.length ? parent.x + NODE_WIDTH : 60 + OBJECTIVE_WIDTH;
                  const startY = node.parents.length ? parent.y + NODE_HEIGHT / 2 : layout.height / 2;
                  const endX = x;
                  const endY = y + NODE_HEIGHT / 2;
                  const bend = Math.max(42, (endX - startX) * 0.48);
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
                  aria-label={`${node.title}, ${roleLabel(node)} branch${drafted ? ", added to next move" : ""}${node.validation.boot === "failed" ? ", failed validation" : ""}`}
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
                  <rect x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT} rx="18" />
                  {node.previewUrl ? (
                    <image
                      href={node.previewUrl}
                      x={x + 10}
                      y={y + 10}
                      width="82"
                      height="84"
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#preview-${node.id})`}
                    />
                  ) : (
                    <rect className="node-preview-placeholder" x={x + 10} y={y + 10} width="82" height="84" rx="11" />
                  )}
                  <circle cx={x + 108} cy={y + 24} r="4" className="role-dot" />
                  <text x={x + 120} y={y + 28} className="node-kicker">{roleLabel(node).toUpperCase()}</text>
                  <text x={x + 106} y={y + 55} className="node-title">{shorten(node.title, 17)}</text>
                  <text x={x + 106} y={y + 78} className="node-meta">G{node.generation} · ★ {averageFun(node)}</text>
                  {drafted && <text x={x + 204} y={y + 24} className="next-move-mark">◆</text>}
                  {node.effectiveState.favorite && <text x={x + 202} y={y + 88} className="favorite-mark">★</text>}
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
                <span className="list-preview">
                  {node.previewUrl ? <img src={node.previewUrl} alt="" /> : <i />}
                </span>
                <span className="list-copy">
                  <span className="list-topline"><span className="list-role">{roleLabel(node)}</span><span>G{node.generation} · ★ {averageFun(node)}</span></span>
                  <strong>{node.title}</strong>
                  <span>{node.id}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="graph-hint">Click to open · Shift-click or Space to add to next move</p>
    </section>
  );
}
