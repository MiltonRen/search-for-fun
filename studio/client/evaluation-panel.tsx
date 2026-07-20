import { useEffect, useRef, useState, type FormEvent } from "react";
import type { NodeProjection } from "../shared/types";
import type { EvaluationPayload } from "./api";
import type { LivePlaySession } from "./player-frame";

interface EvaluationPanelProps {
  node: NodeProjection;
  session: LivePlaySession | null;
  saving: boolean;
  onSave(payload: EvaluationPayload): Promise<void>;
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export function EvaluationPanel(props: EvaluationPanelProps) {
  const [fun, setFun] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setFun(null);
    setHoveredStar(null);
    setFeedback("");
  }, [props.node.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (fun === null || props.saving) return;
    const session = props.session ?? {
      id: crypto.randomUUID(),
      startedAt: performance.now(),
      restarts: 0,
      completed: false,
      telemetry: [],
    };
    await props.onSave({
      nodeId: props.node.id,
      session: {
        id: session.id,
        durationSeconds: Math.max(0, Math.round((performance.now() - session.startedAt) / 100) / 10),
        restarts: session.restarts,
        completed: session.completed,
      },
      ratings: { fun },
      preserve: "",
      change: "",
      note: feedback.trim(),
      telemetry: session.telemetry,
    });
    setFun(null);
    setFeedback("");
  };

  const chooseRating = (value: number) => {
    setFun(value);
    window.requestAnimationFrame(() => feedbackRef.current?.focus());
  };

  const visibleRating = hoveredStar ?? fun ?? 0;

  return (
    <aside className="evaluation-panel" aria-label="Playtest feedback">
      <div className="section-heading evaluation-heading">
        <div>
          <span className="eyebrow">Feedback</span>
          <h2>Was it fun?</h2>
        </div>
        <span className="session-chip">{props.node.evaluations.length} saved</span>
      </div>

      <form className="evaluation-form" onSubmit={(event) => void handleSubmit(event)}>
        <fieldset className="star-rating">
          <legend>Fun</legend>
          <div
            className="star-buttons"
            onMouseLeave={() => setHoveredStar(null)}
            aria-label="Fun rating from one to five stars"
          >
            {STAR_VALUES.map((value) => (
              <button
                type="button"
                key={value}
                className={value <= visibleRating ? "filled" : ""}
                aria-label={`${value} ${value === 1 ? "star" : "stars"} out of 5`}
                aria-pressed={fun === value}
                onMouseEnter={() => setHoveredStar(value)}
                onFocus={() => setHoveredStar(value)}
                onBlur={() => setHoveredStar(null)}
                onClick={() => chooseRating(value)}
              >
                <span aria-hidden="true">★</span>
              </button>
            ))}
          </div>
          <span className="rating-caption">{fun === null ? "Choose a score" : `${fun} / 5`}</span>
        </fieldset>

        <label className="field-label feedback-field">
          <span>Feedback <small>Enter to save · Shift+Enter for a new line</small></span>
          <textarea
            ref={feedbackRef}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder="What felt good—or got in the way?"
            maxLength={5000}
          />
        </label>

        <button className="primary-button evaluation-submit" type="submit" disabled={props.saving || fun === null}>
          {props.saving ? "Saving…" : "Save feedback"}
        </button>
      </form>

      {props.node.evaluations.length > 0 && (
        <div className="prior-evaluations">
          <h3>Previous feedback</h3>
          {props.node.evaluations.slice(0, 4).map((evaluation) => {
            const combinedFeedback = [
              evaluation.note,
              evaluation.preserve ? `Keep: ${evaluation.preserve}` : "",
              evaluation.change ? `Change: ${evaluation.change}` : "",
            ].filter(Boolean).join(" ");
            return (
              <article key={evaluation.id} className="evaluation-card">
                <div>
                  <span className="saved-stars" aria-label={`${evaluation.ratings.fun ?? 0} out of 5 stars`}>
                    {STAR_VALUES.map((value) => (
                      <span key={value} className={typeof evaluation.ratings.fun === "number" && value <= evaluation.ratings.fun ? "filled" : ""}>★</span>
                    ))}
                  </span>
                  <time dateTime={evaluation.createdAt}>
                    {new Date(evaluation.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </time>
                </div>
                {combinedFeedback && <p><strong>Feedback</strong> {combinedFeedback}</p>}
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}
