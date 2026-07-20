---
name: search-for-fun
description: Run a durable, repository-backed game-design search with playable KAPLAY prototypes. Use when the user wants to start, widen, resume, evaluate, refine, cross, leap from, reject, or select branches in a Search-for-fun repository, including requests to continue studio-flagged nodes or recover a search without its original Codex task.
---

# Search for fun

Treat game design as measured search. Keep the human in charge of the objective and preserve every completed branch as a sealed, playable node.

## Choose the operation

- **Start**: create an objective and three divergent root nodes.
- **Continue**: claim and execute pending studio commands.
- **Resume**: reconstruct the objective, graph, evidence, pending work, and unresolved questions from repository files.
- **Direct move**: expand, cross, leap, reject, archive, favorite, or select the named nodes.
- **Synthesize**: compare evidence and recommend experiments without choosing for the user.

Run `npm run validate` before mutation. Stop if the selected search is invalid; report the exact artifact and preserve it for repair.

## Start a search

1. Read [search-strategy.md](references/search-strategy.md).
2. Ask no more than three questions, and only when the answers materially change the search. Establish:
   - the desired player feeling and fantasy;
   - session and input constraints;
   - success mode: joy, portfolio, commercial, learning, or custom;
   - the smallest useful playtest measurement.
3. For commercial searches, begin with `fun`, `appeal`, and `scopeConfidence`; use `readability` and `fantasyFit` as useful components of appeal. For other success modes, tailor the rubric.
4. Run `npm run search:create --` with explicit arguments. Never hand-author IDs.
5. Create exactly three first-round briefs: **Readable**, **Adjacent**, and **Leap**. All are parentless `root` nodes; the search objective is the virtual graph root.
6. Read [prototype-contract.md](references/prototype-contract.md), then delegate the three independent briefs to three subagents in parallel when subagents are available. This skill explicitly requests that delegation. If capacity is unavailable, execute the same briefs sequentially. Give every scout a unique directory under `.search-for-fun/staging/`.
7. Scouts may write only their assigned staging directory. They must produce `game/index.ts`, `result.json`, and `hypothesis.md`.
8. Import each result with `npm run search:import --`. Import only after schema validation, typechecking, and bundling pass. Record a failed attempt instead of weakening the contract.
9. Run `npm run validate`, summarize what each node tests, and ask the user to play them in the studio.

## Continue pending commands

1. Read the active objective revision, node records, evaluations, and `commands/pending/`; do not rely on prior chat context.
2. Claim one command atomically with `npm run search:claim --` before starting scouts.
3. Translate command types precisely:
   - `expand`: create one child per parent in `parallel` mode, or one child in `single` mode;
   - `cross`: create one `crossover` child with every selected node as a parent;
   - `leap`: preserve the objective but change a major design dimension cheaply;
   - `favorite`, `archive`, `reject`, `select`: record the disposition; do not edit or delete the sealed node.
4. For implementation commands, read the latest evidence and state explicit dimensions to preserve and change. Use a scout that did not originate the parent when practical.
5. Import validated children, then run `npm run search:complete --` with their IDs and a concise result summary.
6. Run `npm run validate`. If a claimed command cannot be completed, run `npm run search:fail --` with the command ID and a concise reason. Never leave a failed command stranded in `processing` or silently retry it forever.

## Evaluate and narrow

Read [evaluation-guide.md](references/evaluation-guide.md) before synthesizing playtests.

- Keep telemetry, human ratings, notes, and agent critique separate.
- Treat ratings as evidence, never as an automatic fun score.
- Expand no more than two strong branches by default.
- Ask what must survive before refining.
- Offer a leap after two consecutive refinement-only rounds.
- Recommend a second playtest when evidence is extreme, contradictory, very short, or affected by a runtime error.
- Preserve at least one unresolved alternative until the user chooses to converge.

## Select a candidate

Do not delete alternatives. Generate a decision record containing the selected node, supporting evidence, known weaknesses, qualities to preserve, rejected alternatives and reasons, production risks, and remaining uncertainty. Run `npm run search:summarize --` to refresh the durable summary.

## Guardrails

- Never edit a sealed node's game, hypothesis, ancestry, or core metadata in place.
- Never let scouts write search-level indexes, events, objectives, or commands.
- Do not add dependencies inside prototypes.
- Keep remote assets and runtime network access disabled.
- Do not commit, push, publish, delete, or launch continuous autonomous search without an explicit user request.
- Treat `.search-for-fun/staging` and cache data as disposable; treat `searches/` as canonical.
