# Pogo Storm: Surge Battery

## Refinement hypothesis

A self-recovering two-stomp battery plus an explicit 1-to-100 horde ramp with telegraphed surge waves will turn repeated Space presses into a readable timing decision while delivering the requested conspicuous escalation without changing Relay Overdrive's movement or powers.

The parent earned **4/5 fun** in a **59.7-second** incomplete session. The player asked for exactly two changes: “an auto-recovery energy bar so you can't spam space” and an enemy horde that rises “1-100 in 30 seconds” with periodic sudden waves. This child changes only stomp economy and population pressure.

## Changed pressure system 1: STOMP battery

STOMP starts at 100. A valid airborne Space press spends 44 and applies the existing downward velocity. Recovery pauses for 0.45 seconds, then returns at 24 points per second. This allows two quick stomps from full charge but blocks the third until recovery crosses the visible 44-point cost marker.

An under-cost press never reapplies downward velocity. The compact left-anchored bar and text distinguish `CHARGED`, `READY`, `SPENT`, `RECOVER`, and `EMPTY`. Successful spends emit `stomp_energy_spend`; blocked presses emit `stomp_energy_blocked`, throttled to at most once per 0.8 seconds to avoid telemetry floods. Primary still starts the automatic bounce without consuming energy while the hero is too low to stomp.

## Changed pressure system 2: horde ramp and surges

The target population is deterministic:

`1 + floor(clamp(elapsed / 30, 0, 1) * 99)`

That reads exactly as 1 at second 0, 34 at second 10, 67 at second 20, and 100 at second 30, then holds at 100. The compact `HORDE current/target` HUD makes the curve directly inspectable. When eliminations pull the active population under target, a refill budget of `8 + target × 0.20` foes per second catches it up quickly enough that Lancer cannot erase the ramp.

Starting at second 6.4 and every 6.8 seconds thereafter, a sparse banner warns of the next pattern. After 0.9 seconds, a surge adds `min(22, 8 + floor(elapsed / 3))` foes above the baseline target under a hard cap of 125. Surge compositions cycle through the preserved skitter, hover, and charger vocabularies; they do not introduce a fourth threat type. `horde_ramp` records only the 0/10/20/30 checkpoints, while `horde_surge` separates warning and release.

## Controlled dimensions

- Automatic launch, landing, and relaunch pogo arcs with Left/Right air steering.
- Direct Capacitor, Lancer, and Phase unlocks at 1.7, 5.7, and 9.7 seconds.
- Capacitor landing pulse plus echo, triple-target automatic Lancer, and rechargeable Phase contact conversion.
- Five health, 84 seconds, deterministic seed 1729031, 640 × 640 keyboard play.
- Grayscale geometry with restrained gold, sparse copy, and no pickups, followers, menus, or assets.
- One authoritative player transform. Body, halo, spring, boot, landing guide, Phase guard, and Lancer emitter remain local children. Each threat retains one authoritative moving transform.

## Smallest useful playtest

Spam Space through one bounce and verify two spends, a blocked press that does not change the descent, then automatic recovery to READY. Continue through second 30 and compare the visible current population with the 1/34/67/100 targets while observing at least three warned surge releases.

The playtest succeeds if the battery creates a deliberate stomp rhythm, the baseline population tracks its explicit curve despite clears, and the periodic excess feels conspicuously wild without obscuring the three established enemy shapes or the three overdrive effects.

## Residual risks

At 100-plus actors, Phase detonation and Capacitor landings can clear large clusters; the refill rate intentionally restores the baseline quickly, which may look like immediate reinforcements. The foe cap is 125 and spark effects are separately capped at 240 for stability, but full-run frame pacing remains a required post-import check. Charger surge composition is deliberately sparse because each charger carries a full-width telegraph; increasing charger share would reduce readability before it adds useful difficulty.
