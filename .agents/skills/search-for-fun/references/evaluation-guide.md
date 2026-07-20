# Evaluation guide

## Evidence layers

Keep these sources distinct:

1. **Human playtest**: subjective ratings, what to preserve, what to change, and observations.
2. **Behavioral telemetry**: duration, first input, restarts, completion, failure, and declared events.
3. **Technical evidence**: schema, typecheck, bundle, boot, console, screenshot, and teardown results.
4. **Agent critique**: hypothesis fit, confounds, readability, scope risk, and suggested experiments.

Human judgment remains authoritative for creative selection.

## Synthesis questions

- Did the implementation actually test its stated hypothesis?
- Which variable produced the observed effect?
- What should survive into a child?
- What should change in only one major dimension?
- Is a low score evidence against the hypothesis or against implementation quality?
- Did the fantasy become legible within the target time?
- Is the result finishable at the intended quality?
- Is another playtest cheaper than making the wrong branch decision?

## Re-measure when

- an extreme rating follows a very short session;
- prose contradicts numeric ratings;
- a runtime error or unclear instruction affected the session;
- the evaluator built the branch and may be attached to it;
- close branches would otherwise be chosen arbitrarily.

## Candidate record

Include:

- selected node and objective revision;
- evidence supporting the decision, with sources;
- weaknesses and uncertainty;
- mechanics, feelings, and presentation qualities to preserve;
- rejected alternatives and explicit reasons;
- prototype shortcuts that must not enter production unchanged;
- next production risks to investigate.
