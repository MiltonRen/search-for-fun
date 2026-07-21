# Pogo Storm: Relay Overdrive

## Refinement hypothesis

Igniting three dramatic power stages directly on a fixed early schedule will make Pogo Storm feel like an escalating screen-clearing survivor engine without interrupting or replacing its launch, steering, and stomp-timing loop.

This refinement responds narrowly to the latest human evidence: **4/5 fun**, **11.3 seconds**, incomplete, with the note **“No need to have power up follow uplayer.”** The session already exposed Capacitor and Lancer, so power vocabulary is controlled. The changed dimension is exclusively how powers arrive and how forcefully each stage reads.

## The one changed dimension

The homing relay actors are removed completely. There are no power pickups, followers, collection collisions, or delivery targets.

- **Capacitor Overdrive** ignites directly at second 1.7. Every landing emits a much larger initial wave and a delayed, farther-reaching echo. The first powered landing records its meaningful trigger.
- **Lancer Overdrive** ignites directly at second 5.7. A bright weapon chain jumps through up to three nearest threats on a 1.28-second cadence. The first chain that clears a target records its meaningful trigger.
- **Phase Overdrive** ignites directly at second 9.7. Its large attached guard stays visibly charged until the next contact is converted into a conspicuous crushing detonation. It then visibly recharges after 6.5 seconds, preserving contact pressure instead of granting permanent invulnerability. The first converted contact records its meaningful trigger.

All three unlocks occur before second 10, inside the previous 11.3-second session. The staged HUD distinguishes locked, charged, and recharging states without adding a menu or input.

## Controlled dimensions

Automatic pogo relaunch, Left/Right air steering, Space stomp timing, landing shockwaves, rough-landing/contact damage, five health, the ground-skitter/hover-weave/charger rotation, approximate enemy density, 84-second run, deterministic seed 1729031, 640 × 640 keyboard play, and sparse grayscale-plus-gold presentation remain controlled. The visible body, halo, spring, boot, landing guide, guard, and weapon are local children of one authoritative player transform. Every threat has one authoritative transform, and the opening skitters move immediately after the declared starting action.

Telemetry keeps exposure and use separate. `power_unlock` records each scheduled ignition, while `power_trigger` records only the first landing wave, clearing Lancer chain, or converted Phase contact and includes cleared count. `phase_recharge` records later guard availability. First input, encounter exposure, stomp decisions, damage, death, goal, and round end remain distinct.

## Smallest useful playtest

By second 11, does the escalating relay feel dramatically more powerful and screen-clearing without interrupting or trivializing the pogo timing loop?
