# Orbitbound: Visible Ring Clamp

## Hypothesis

A clearly telegraphed ring clamp that makes one lane temporarily unsafe will turn radial hops into meaningful, readable survival decisions without changing Orbitbound's movement, automatic combat, or progression loop.

The prior evidence is weak: a single 3/5 fun rating came from an 8.2-second, incomplete session with no telemetry and the note “more challenging?” This refinement therefore treats challenge as a question, not a mandate. It puts one forgiving pressure decision inside that short observation window rather than raising health, durability, or general enemy speed.

## One changed dimension: challenge pressure

At 2.8 seconds, two accent-colored clamp teeth appear on the player's current ring. They travel visibly toward one another while the whole targeted ring flashes and the compact banner says which ring will clamp. The first pair closes after 2.6 seconds, near 5.4 seconds into play. Being on another lane—or inside the existing safe middle of a radial hop—avoids it. Remaining on the warned lane costs one of the unchanged four health units.

Later clamps use the same rule. Their interval and warning duration tighten gradually, producing legible escalation without introducing a second hazard vocabulary. A successful result should feel like “I hopped because that ring was closing,” not merely “enemies do more damage.”

## Controlled dimensions

- Exactly four concentric lanes with the same radii.
- Left/right orbiting and the same angular-speed rule.
- Up/down radial hops, 0.38-second transition, and readable airborne safety.
- Automatic nearest-target volleys with the same spread and fire-rate tiers.
- Continuous pickup collection, pickup thresholds, and timed survival milestones.
- The same 100-second run, four health, inward enemy model, and automatic combat cadence.
- Deterministic keyboard-only input and the parent's grayscale-plus-teal 640 × 640 presentation.

## Smallest useful playtest measurement

Play through the first clamp only, then record the studio's one-to-five **fun** rating separately. Ask: “Was the flashing ring enough to make the hop feel intentional?” The smallest useful behavioral signal is whether the player attempts an up/down hop after the warning and before the 5.4-second closure.

Telemetry is intentionally compact:

- `first_input` records the semantic action that begins the run.
- `decision` records each lane hop, whether it answered an active clamp, and each clamp warning.
- `goal` records the first clamp evasion, normal power milestones, and survival.
- `damage` distinguishes `ring_clamp` from ordinary `enemy_contact`.
- `death` and `round_end` record lane hops, pressure hops, clamps faced/avoided, kills, power, and outcome.

## Risks

A whole-ring denial is intentionally blunt so the challenge question is readable in a short playtest. If players hop mechanically without tracking the converging teeth, a follow-up should test a more local denial arc. If they understand the warning but feel interrupted too often, the interval—not health or enemy stats—is the isolated tuning knob.
