# Search-for-fun repository guidance

Search-for-fun is a local-first game-design search tool. Repository files are the canonical state; the studio and Codex skill are projections and operators over those files.

## Invariants

- Never edit a sealed node's `game/`, `hypothesis.md`, or core `node.json` fields in place. Create a child node.
- Keep graph ancestry in node metadata, not Git branches.
- Studio writes are limited to evaluations, commands, and previews through the validated local API.
- Generated game code may import `kaplay` types and the runtime contract only. It must not initialize KAPLAY or add dependencies.
- Keep KAPLAY pinned to `4000.0.0-alpha.27.1` until runtime fixtures pass an explicit upgrade review.
- Do not commit, push, publish, delete canonical nodes, or access the network without an explicit user request.

## Verification

Run `npm run check` for a complete verification pass. During focused work, use:

- `npm run typecheck`
- `npm test`
- `npm run validate`
- `npm run build`

The local studio runs with `npm run dev` and binds to `127.0.0.1` by default.
