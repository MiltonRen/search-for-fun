# Orbitstorm: Visible Evasion Relay

## Rendering-only repair context

This package repairs the occluded n_0008 attempt without changing its design. Live QA confirmed that the authoritative player and moving enemies rendered and moved, while a persistent full-canvas KAPLAY background object covered the immediate-mode lanes, HUD, hazard warnings, and instructions. Removing that one covering object restores visibility; every movement, combat, hazard, relay, timing, telemetry, seed, input, and art-language variable remains identical.

## Crossover hypothesis

Making each of the first three successful **Pinch**, **Sweep**, and **Rake** evasions directly unlock **Capacitor**, **Lancer**, and **Phase Guard** will turn readable movement mastery into visible arsenal growth. The player should begin anticipating the next movement challenge because every clean response advances the relay, without adding pickups, menus, or another input.

Both parents earned 4/5 in their latest sessions. Orbitbound's player evaded all of the first three hazard variations in 11.3 seconds, demonstrating that the movement grammar is legible. Pogo exposed its first two powers in 11.3 seconds, but the player noted that the power-up did not need to follow the player. This child removes power pickup actors entirely and makes hazard movement the only progression currency.

## The crossover loop

- The first successful hazard evasion unlocks **Capacitor**. Every completed 0.38-second radial hop then emits a local gold shockwave that can clear nearby threats.
- The second successful evasion unlocks **Lancer**. An attached weapon automatically draws a short gold strike to the nearest threat on a steady cadence.
- The third successful evasion unlocks **Phase Guard**. An attached gold guard converts the next ring hazard or enemy contact instead of losing health.

On a clean opening, the three states unlock near 3.2, 7.4, and 11.4 seconds. There are no homing, following, stationary, or collectible power pickups. The relay advances only when the player successfully clears a warned movement beat.

## Controlled dimensions

Orbitbound's four concentric lanes, left/right orbit movement, up/down radial hops, automatic nearest-target volleys, inward-moving threats, four health, 100-second run, and deterministic seed remain controlled. Pinch, Sweep, and Rake keep their shapes, fixed order, warning windows, and early schedule. One authoritative player carries its visible body, halo, crest, weapon, and guard as local children. The 640 × 640 presentation stays keyboard-only and uses a sparse grayscale base, teal for hazard language, and a restrained gold relay cue.

## Smallest useful playtest

Play through the first three warnings and ask: **Does evading each beat visibly build an arsenal, and does that reward make the next movement challenge more exciting to anticipate?**

Telemetry keeps the two sides of the loop separate. `decision` reports hazard warnings and first responses, `goal` reports variation-specific evasions, and `damage` reports hits. `power_unlock` reports the evasion that advanced the relay, while `power_trigger` reports the first visible use of each earned power. Round-end telemetry preserves per-variation hazard totals alongside unlocked powers and power trigger counts.

## Risk

Lancer can reduce ambient enemy pressure after the second clear, so the hazard actors—not enemy density—remain the primary movement challenge. If the relay feels automatic rather than earned, the next experiment should tighten only the evasion criterion or power demonstration, not add pickups back into the arena.
