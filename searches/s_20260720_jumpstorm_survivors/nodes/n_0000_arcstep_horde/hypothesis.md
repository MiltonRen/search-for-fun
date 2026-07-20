# Arcstep Horde

Combining familiar side-view movement and forgiving jumping with automatic aimed attacks should make horde evasion and platform positioning immediately fun. The smallest useful playtest measurement is whether the player reaches the first power tier and continues jumping to reposition instead of settling into passive waiting.

The controlled baseline is a 640-by-640 side-view survival arena with horizontal movement, buffered/coyote-time jumping, solid one-way platforms, a health limit, automatic nearest-target bolts, an escalating swarm, collectible defeat drops, and an explicit survival end. The objective still targets three-to-five-minute sessions; this first playtest compresses the complete escalation curve into 96 seconds so one run can expose the core interaction quickly.

Power growth is deliberately automatic and legible. Enemy defeats create gold sparks that magnetize at close range. A filled spark bar triggers a banner, expanding ring, healing pip, orbiting power marker, faster fire, stronger damage, and—at alternating tiers—an additional aimed bolt. The player never stops for an upgrade menu, so the experiment stays focused on whether jumping through the arena meaningfully steers the otherwise automatic fight.

Telemetry remains small and separated from the eventual human `fun` rating. `first_input` records whether movement or jumping began the run; `decision` records only the 10- and 25-jump milestones; `goal` records each power tier with time, kills, and jumps; `damage` records health loss; `death` records defeat; and `round_end` records outcome, first-upgrade time, jump count, airtime, power, and kills before `complete` or `fail` closes the run.
