# Prototype contract

Every scout owns exactly one staging directory:

```text
.search-for-fun/staging/<job-id>/
├── result.json
├── hypothesis.md
└── game/
    ├── index.ts
    └── assets/        # optional, local only
```

Do not write anywhere else.

## Game module

```ts
import type { KAPLAYCtx } from "kaplay";
import type {
  NodeRuntimeContext,
  PlaytestApi,
  SearchForFunGame,
} from "@search-for-fun/runtime";

const game: SearchForFunGame = {
  id: "staged", // the importer replaces this exact placeholder with the allocated node ID
  title: "Experiment title",
  instructions: "Press Space or click to act.",

  mount(k: KAPLAYCtx, playtest: PlaytestApi, runtime: NodeRuntimeContext) {
    // Build the initial interactive scene first.
    // Use runtime.seed for deterministic randomness.
    // Use runtime.assetUrl("file.png") for local assets.

    playtest.ready();
    return () => {
      // Dispose only non-KAPLAY resources created by this module.
    };
  },
};

export default game;
```

The final canonical module ID must equal its allocated node ID. A staging module may export `id: "staged"`; the import controller replaces that exact literal after allocating the ID.

## Rules

- Never call `kaplay()` or create a second canvas.
- Do not add packages, remote URLs, DOM overlays, storage, workers, or network requests.
- Use the supplied non-global `KAPLAYCtx`.
- Target the repository's exact pin, `kaplay@4000.0.0-alpha.27.1`, and follow [kaplay-v4000.md](kaplay-v4000.md).
- Never mutate a transform axis such as `actor.pos.x`, `actor.pos.y`, or `actor.scale.x`. In pinned KAPLAY v4000 that bypasses transform invalidation and can leave the rendered object frozen. Assign a complete `Vec2` or use `move()`, `moveBy()`, `moveTo()`, `scaleTo()`, or `scaleBy()`.
- Move one authoritative player object. Add its visible body, halo, shadow, crest, weapon, and other attached visuals as local children with `player.add(...)`; do not synchronize several unrelated world objects by hand.
- Give intended moving threats visible motion within the first few seconds. Verify that the rendered enemy moves, not only its numeric state.
- Prefer semantic buttons: `primary`, `secondary`, directions, `pause`, and `restart`.
- Build for the declared viewport, normally 640 × 640.
- Call `playtest.ready()` only after the first interactive scene exists. The host captures a screenshot after readiness.
- Emit small, documented telemetry events. Useful names include `first_input`, `decision`, `damage`, `death`, `goal`, and `round_end`.
- Call `playtest.complete()` for success and `playtest.fail()` for an in-game failure. Runtime exceptions are captured separately.
- Keep the experiment understandable within the objective's target and make restart safe.
- Use a grayscale foundation with one restrained accent unless the brief specifies an art direction.
- Keep in-game copy sparse: one short control hint and compact state labels are normally enough.
- Use geometry and small local sounds before asset-heavy presentation.

## Required play check

Before completing a staged result, start it with a declared action, move for one second, watch enemies for three seconds, and restart once. Confirm that the visible player moves, attached visuals stay aligned, and at least one intended moving enemy changes position. Do not return a result that only typechecks or looks correct in a still screenshot.

## Result manifest

`result.json` must validate against `schemas/scout-result.schema.json`:

```json
{
  "schemaVersion": 1,
  "briefId": "first-round-readable",
  "title": "Beam Rhythm",
  "hypothesis": "A readable timing window creates tense one-more-try play.",
  "searchRole": "readable",
  "edgeType": "root",
  "parents": [],
  "changesFromParents": [],
  "preserve": ["one-button input", "one-minute session"],
  "report": "Tests whether a visible timing window alone carries the fantasy.",
  "actions": ["primary", "restart"],
  "seed": 41832,
  "viewport": { "width": 640, "height": 640 }
}
```

For a crossover, use `edgeType: "crossover"`, `searchRole: "crossover"`, and at least two parent IDs. For refinement, state exactly what changes and what remains controlled.
