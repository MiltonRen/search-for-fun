# Pogo Storm

## Hypothesis

Converting platform jumps into a repeating offensive rhythm preserves agile platform fantasy while making the avatar itself the auto-escalating survivor weapon. The intended rhythm is **launch → steer → stomp → explosive landing**, not walking while attacks fire around the player.

## What this prototype tests

- Whether automatic relaunches preserve the pleasure of agile platform arcs without requiring conventional walking or authored platforms.
- Whether a single downward stomp makes the landing point into a legible, expressive target.
- Whether kills earned on clean stomps make orbit growth feel causally tied to the player's rhythm rather than to passive experience gain.
- Whether orbit hits and short-range death reactions create a survivor-scale escalation while keeping the hero—not a separate gun—the center of the fantasy.

The 84-second run is a compressed stand-in for a three-to-five-minute session. Early play teaches the arc against ground swarmers, hovering threats arrive after the rhythm is visible, and later density demonstrates the orbit and cascade ceiling quickly enough for a first playtest.

## Controls and rules

- **Left / Right** or **A / D** steer while airborne.
- **Space** forces a downward stomp. A stomp that lands on a cluster creates a larger pulse and grows the orbit meter.
- Every landing automatically launches the next arc; the hero cannot walk.
- Direct contact and an unstomped landing inside a surviving cluster cost health.
- **R** requests a clean runtime restart.

## Smallest useful playtest measurement

After one run, collect the studio's one-to-five **fun** rating and ask: “Did you start choosing a landing spot before pressing Space?” The smallest behavioral success is one clean stomp followed by a deliberate second clean stomp. A stronger signal is reaching orbit three while the player can describe the launch-steer-stomp rhythm without prompting.

Telemetry remains separate from the rating:

- `first_input` records the semantic action that began the bounce.
- `decision` records each stomp's height, current orbit, and run time.
- `goal` records the first successful rhythm, stomp-streak milestones, orbit growth, and survival.
- `damage` and `death` distinguish direct contact from an unstomped rough landing.
- `round_end` and completion properties record outcome, clears, orbit size, clean landings, best streak, and best cascade.

## Readability and scope risks

Late chain reactions may make it hard to distinguish a landing kill from an orbit kill. The prototype limits reactions to local radii, uses gold only for the hero, orbit, and armed stomp, and keeps enemies grayscale. It does not test character art, authored stages, upgrade menus, content variety, or a full three-to-five-minute balance curve.
