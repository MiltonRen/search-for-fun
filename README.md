![alt text](/cover.png "Logo")

Search-for-fun is a local-first game-design engine for Codex and KAPLAY. It turns one idea into a search graph of small playable hypotheses, to help indie game devs find more fun :)

The repository is the database. No account, cloud service, or deployment is required.

## Quick start

Requirements: Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The included **Jumpstorm Survivors** search contains a sample search graph. Or run your own search by following the below instructions:

## Run a design search with Codex subagents

In Codex, start with:

```text
$search-for-fun + [your awesome game idea]
```

No additional setup is needed for subagent-driven searches. The skill starts the local studio automatically when the games are ready. After playtesting, use:

```text
$search-for-fun Continue the flagged branches.
```

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

## Canonical model

- `searches/<search-id>/search.json` stores search-level state.
- `objectives/rev_####.json` stores immutable objective revisions.
- `nodes/<node-id>/` stores one sealed game, hypothesis, metadata, and preview.
- `evaluations/sessions/` stores append-only playtest records.
- `commands/{pending,processing,processed}/` is the durable studio-to-Codex queue.
- `events.jsonl` is the validated chronology.
- `.search-for-fun/` contains ignored staging, lock, and bundle-cache data.

## Local security boundary

The server binds to `127.0.0.1`, rejects non-loopback host headers, requires same-origin requests and a per-process token for writes, canonicalizes repository paths, rejects symlink escapes, and runs node games in sandboxed iframes without `allow-same-origin`. Prototype content security policy disables network connections by default.
