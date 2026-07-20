# Search-for-fun

Search-for-fun is a local-first game-design search studio for Codex and KAPLAY. It turns one idea into a durable graph of small playable hypotheses, keeps every sealed branch in the repository, records playtest evidence, and queues explicit next moves for Codex.

The repository is the database. No account, cloud service, or deployment is required.

## Quick start

Requirements: Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The included **Jumpstorm Survivors** search contains three divergent roots and a playable childs, so the complete graph, player, evaluation, comparison, preview, and command flows are available immediately.

Use the studio to:

- explore the fullscreen map and click a branch to expand it;
- play its square prototype between a short explanation and feedback panel;
- give one one-to-five-star fun rating and quick written feedback;
- flag one or more branches, compare two, and queue an expand, cross, or leap command; and
- see a passive bottom prompt when queued work is waiting, then ask Codex to continue the search

## Run a design search with Codex

The repository-local skill lives at `.agents/skills/search-for-fun`. In Codex, start with:

```text
$search-for-fun Start a one-button game about keeping a lighthouse alive in a storm.
```

No separate studio setup is needed for skill-driven searches. The skill starts the local studio automatically, keeps it available while scouts work, and performs a clean verified restart after every completed work cycle.

The skill creates a versioned objective, gives the first round readable, adjacent, and leap briefs, validates staged KAPLAY games, and imports them as immutable root nodes. After playtesting, use:

```text
$search-for-fun Continue the flagged branches.
```

The continuation reads repository state rather than relying on old chat context, claims pending commands atomically, imports validated children, and records completion.

## Repository commands

```bash
npm run validate
npm run check
npm run build
npm start
npm run studio:status
npm run studio:ensure
npm run studio:restart
npm run studio:stop
```

`npm run check` runs the test suite, validates every canonical search, typechecks the workspace, and creates production client and server bundles.

`studio:ensure` starts a detached development studio only when needed. `studio:restart` gracefully stops the verified repository-owned process and starts a fresh one; it never kills an unrelated process occupying the port. Logs and PID metadata live in the ignored `.search-for-fun/cache/` directory. `npm run dev` remains available when a developer explicitly wants a foreground server.

The skill normally drives the lifecycle scripts, but they are also available directly:

```bash
npm run search:create -- \
  --title "Lighthouse in a Storm" \
  --fantasy "Keep a tiny lighthouse alive during an overwhelming storm" \
  --feel "tense,hopeful,one-more-try" \
  --success commercial \
  --session "30,120" \
  --constraints "one primary action|readable within ten seconds"

npm run search:import -- --search <search-id> --staging .search-for-fun/staging/<brief>
npm run search:claim -- --search <search-id>
npm run search:complete -- --search <search-id> --command <command-id> \
  --nodes <comma-separated-node-ids> --summary "What the move produced"
npm run search:fail -- --search <search-id> --command <command-id> \
  --error "Why the claimed move could not be completed"
npm run search:summarize -- --search <search-id>
```

## Canonical model

- `searches/<search-id>/search.json` stores search-level state.
- `objectives/rev_####.json` stores immutable objective revisions.
- `nodes/<node-id>/` stores one sealed game, hypothesis, metadata, and preview.
- `evaluations/sessions/` stores append-only playtest records.
- `commands/{pending,processing,processed}/` is the durable studio-to-Codex queue.
- `events.jsonl` is the validated chronology.
- `.search-for-fun/` contains ignored staging, lock, and bundle-cache data.

The host owns KAPLAY initialization, input mapping, screenshots, restart, and teardown. Node code exports a `SearchForFunGame`, receives a non-global KAPLAY context, and cannot initialize the engine or fetch remote code.

## Local security boundary

The server binds to `127.0.0.1`, rejects non-loopback host headers, requires same-origin requests and a per-process token for writes, canonicalizes repository paths, rejects symlink escapes, and runs node games in sandboxed iframes without `allow-same-origin`. Prototype content security policy disables network connections by default.

For the detailed rationale and requirements, see [DESIGN.md](DESIGN.md). The source theory transcript is preserved in [INSIGHT.md](INSIGHT.md).
