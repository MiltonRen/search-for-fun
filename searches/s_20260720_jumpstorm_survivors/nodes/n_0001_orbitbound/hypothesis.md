# Orbitbound

## Controlled question

Does replacing free two-axis movement with four concentric running lanes and timed radial hops add platform-like spatial clarity and expressive evasion to horde survival without turning the arena into a literal side-scroller?

## Prototype

The hero orbits left or right along one of four top-down rings. Up hops outward and down hops inward; the middle of each hop is airborne and clears contact danger. Enemies enter outside the arena and converge across the rings while a targeting volley fires automatically. Dropped energy and fixed survival milestones both widen and accelerate the volley in motion, with no upgrade screen. The run resolves after 100 seconds so a playtest sees the full escalation curve sooner than the 3–5 minute target session.

The experiment deliberately holds automatic offense, escalating horde pressure, keyboard-only input, sparse primitive visuals, and continuous power growth constant. Its changed dimension is the discrete circular traversal grammar.

## What to watch

- Can a new player read the four rings and make a useful first hop within ten seconds?
- Do inward/outward hops feel like intentional evasive jumps, or merely a restricted version of free movement?
- Does orbiting create satisfying threat anticipation as enemies cross ring boundaries?
- Does collecting energy pull the player into risky route changes without obscuring the lane structure?
- By the final volley levels, does the run feel escalating and overwhelming while remaining controllable?

## Telemetry

- `first_input`: first semantic action and elapsed milliseconds.
- `lane_hop`: source ring, destination ring, radial direction, and whether danger was nearby at takeoff.
- `damage`: remaining health, elapsed seconds, and current ring.
- `power_up`: resulting volley level, pickup or survival source, kills, and elapsed seconds.
- `death`: overwhelmed outcome plus elapsed seconds, kills, volley level, and hop count.
- `goal`: survived outcome plus elapsed seconds, kills, volley level, and hop count.
- `round_end`: shared final summary for either outcome.

The smallest useful playtest measurement remains the player's one-to-five `fun` rating. Written feedback should separately note movement readability, hop expressiveness, fantasy fit, and whether the constrained lane system feels liberating or limiting.
