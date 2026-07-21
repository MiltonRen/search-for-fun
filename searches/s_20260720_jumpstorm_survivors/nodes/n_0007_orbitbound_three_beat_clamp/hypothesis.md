# Orbitbound: Three-Beat Clamp

## Hypothesis

Three short, vocabulary-consistent clamp variations will make hazard pressure faster to parse and more dynamic by alternating radial, orbital, and combined movement demands without changing Orbitbound's combat or growth loop.

The parent earned 2/5 after a 77-second session and the note “figure out ways to make this more streamlined and dynamic at the same time.” Its telemetry showed that the player understood the first whole-ring clamp, but the same beat then repeated until it dealt three of four damage points. This refinement changes only the clamp presentation and pacing.

## One changed dimension: clamp rhythm

One teal tooth vocabulary now forms a three-beat cycle:

- **PINCH** starts near 1.8 seconds. Two teeth converge on a short arc of the current ring. A quick radial hop or decisive orbit clears it.
- **SWEEP** follows about four seconds later. One tooth visibly travels along the current ring into the warned angle. Orbiting away is the clearest response; the existing safe hop also works.
- **RAKE** follows about four seconds after that. Three aligned teeth move across three rings while the nearest adjacent ring is marked open, asking for one readable radial hop or a strong orbital sidestep.

All three appear by roughly 12 seconds, then repeat in the same order with slightly wider gaps. Warning windows last 1.35 to 1.75 seconds. There is no new resource, enemy class, attack button, or progression layer.

## Controlled dimensions

- Exactly four concentric lanes at the parent's radii.
- Left/right orbiting and up/down 0.38-second radial hops with the same airborne safety window.
- One authoritative player with its halo, body, and crest attached as local children.
- Automatic nearest-target volleys, continuous pickups, pickup thresholds, and timed power milestones.
- Four health, a 100-second run, deterministic seed 68420317, and keyboard-only 640 × 640 play.
- Sparse grayscale geometry with a single restrained teal accent.

## Smallest useful playtest measurement

Play through the first three warnings. Ask: “Could you read what each teal shape wanted before it closed, and did the sequence make you use both orbiting and hopping?” Compare the three variation-specific results instead of averaging them together.

Telemetry keeps evidence separate:

- `decision` with `kind: hazard_warning` identifies each warning and variation.
- `decision` with `kind: hazard_response` records the first lane-hop and orbit response for that variation.
- `damage` identifies a hazard hit and the variation that caused it.
- `goal` with `kind: hazard_evaded` identifies an evasion, variation, and response type.
- `round_end` reports faced, evaded, and hit totals for each of the three variations.

## Risks

The rake is the most visually dense beat, although it still uses the same teeth and a single highlighted open ring. If players respond to its label but not its geometry, the next child should simplify the rake rather than add another hazard. If the three-beat order becomes predictable too quickly, only order should vary in a later experiment; this node keeps it fixed so readability can be judged first.
