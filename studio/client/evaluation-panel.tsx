import { useEffect, useState, type FormEvent } from "react";
import type { NodeProjection, ObjectiveRecord } from "../shared/types";
import type { EvaluationPayload } from "./api";
import type { LivePlaySession } from "./player-frame";

interface EvaluationPanelProps {
  node: NodeProjection | null;
  objective: ObjectiveRecord | null;
  session: LivePlaySession | null;
  saving: boolean;
  isFlagged: boolean;
  onSave(payload: EvaluationPayload, flag: boolean): Promise<void>;
}

function labelForRubric(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

export function EvaluationPanel(props: EvaluationPanelProps) {
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [preserve, setPreserve] = useState("");
  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const [nextMove, setNextMove] = useState("");
  const [saveAndFlag, setSaveAndFlag] = useState(true);

  useEffect(() => {
    const nextRatings = Object.fromEntries((props.objective?.rubric ?? []).map((rubric) => [rubric, null]));
    setRatings(nextRatings);
    setPreserve("");
    setChange("");
    setNote("");
    setNextMove("");
    setSaveAndFlag(!props.isFlagged);
  }, [props.node?.id, props.objective?.revision, props.isFlagged]);

  if (!props.node || !props.objective) {
    return (
      <aside className="evaluation-panel empty-panel">
        <span className="eyebrow">Evidence</span>
        <h2>Select a branch</h2>
        <p>Play an experiment, then capture what the measurement taught you.</p>
      </aside>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const session = props.session ?? {
      id: crypto.randomUUID(),
      startedAt: performance.now(),
      restarts: 0,
      completed: false,
      telemetry: [],
    };
    await props.onSave({
      nodeId: props.node!.id,
      session: {
        id: session.id,
        durationSeconds: Math.max(0, Math.round((performance.now() - session.startedAt) / 100) / 10),
        restarts: session.restarts,
        completed: session.completed,
      },
      ratings,
      preserve: preserve.trim(),
      change: change.trim(),
      note: note.trim(),
      ...(nextMove.trim() ? { nextMove: nextMove.trim() } : {}),
      telemetry: session.telemetry,
    }, saveAndFlag);
    setPreserve("");
    setChange("");
    setNote("");
    setNextMove("");
  };

  return (
    <aside className="evaluation-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Evidence</span>
          <h2>Playtest note</h2>
        </div>
        <span className="session-chip">{props.node.evaluations.length} saved</span>
      </div>

      <form className="evaluation-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="rubric-list">
          {props.objective.rubric.map((rubric) => (
            <fieldset className="rating-row" key={rubric}>
              <legend>{labelForRubric(rubric)}</legend>
              <div className="rating-buttons">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={ratings[rubric] === value ? "selected" : ""}
                    aria-label={`${labelForRubric(rubric)} ${value} out of 5`}
                    aria-pressed={ratings[rubric] === value}
                    onClick={() => setRatings((current) => ({ ...current, [rubric]: value }))}
                  >
                    {value}
                  </button>
                ))}
                <button
                  type="button"
                  className={`not-measured ${ratings[rubric] === null ? "selected" : ""}`}
                  aria-label={`${labelForRubric(rubric)} not measured`}
                  aria-pressed={ratings[rubric] === null}
                  onClick={() => setRatings((current) => ({ ...current, [rubric]: null }))}
                >
                  —
                </button>
              </div>
            </fieldset>
          ))}
        </div>

        <label className="field-label">
          <span>Preserve</span>
          <textarea
            value={preserve}
            onChange={(event) => setPreserve(event.target.value)}
            placeholder="The moment, mechanic, or feeling worth carrying forward…"
            maxLength={2000}
          />
        </label>
        <label className="field-label">
          <span>Change</span>
          <textarea
            value={change}
            onChange={(event) => setChange(event.target.value)}
            placeholder="The clearest friction or failed assumption…"
            maxLength={2000}
          />
        </label>
        <label className="field-label compact-field">
          <span>Observation</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything surprising, contradictory, or unresolved…"
            maxLength={5000}
          />
        </label>
        <label className="field-label single-line">
          <span>Next move <em>optional</em></span>
          <input
            value={nextMove}
            onChange={(event) => setNextMove(event.target.value)}
            placeholder="Try the same tension with one shared resource"
            maxLength={1000}
          />
        </label>

        {props.isFlagged ? (
          <div className="check-row flagged-note"><span aria-hidden="true">◆</span><span>Already flagged for the next move</span></div>
        ) : (
          <label className="check-row">
            <input
              type="checkbox"
              checked={saveAndFlag}
              onChange={(event) => setSaveAndFlag(event.target.checked)}
            />
            <span>Flag this branch for the next move</span>
          </label>
        )}

        <button className="primary-button evaluation-submit" type="submit" disabled={props.saving}>
          {props.saving ? "Saving evidence…" : !props.isFlagged && saveAndFlag ? "Save + flag branch" : "Save playtest"}
        </button>
      </form>

      {props.node.evaluations.length > 0 && (
        <div className="prior-evaluations">
          <h3>Prior measurements</h3>
          {props.node.evaluations.slice(0, 4).map((evaluation) => (
            <article key={evaluation.id} className="evaluation-card">
              <div>
                <time dateTime={evaluation.createdAt}>
                  {new Date(evaluation.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
                <span>{evaluation.session.durationSeconds}s · {evaluation.session.restarts} restarts</span>
              </div>
              {evaluation.preserve && <p><strong>Keep</strong> {evaluation.preserve}</p>}
              {evaluation.change && <p><strong>Change</strong> {evaluation.change}</p>}
              {evaluation.note && <p>{evaluation.note}</p>}
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
