import type { GameObj, KAPLAYCtx } from "kaplay";
import type {
  NodeRuntimeContext,
  PlaytestApi,
  SearchForFunGame,
} from "@search-for-fun/runtime";

type HazardKind = "pinch" | "sweep" | "rake";

interface Enemy {
  actor: GameObj;
  angle: number;
  radius: number;
  radialSpeed: number;
  drift: number;
  hp: number;
  size: number;
}

interface Projectile {
  actor: GameObj;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}

interface Pickup {
  actor: GameObj;
  x: number;
  y: number;
  ttl: number;
  spin: number;
}

interface RingHazard {
  actors: GameObj[];
  kind: HazardKind;
  targetLane: number;
  blockedLanes: number[];
  safeLane: number | null;
  centerAngle: number;
  age: number;
  duration: number;
  wave: number;
  respondedHop: boolean;
  respondedOrbit: boolean;
  angleAtWarning: number;
}

const TAU = Math.PI * 2;
const RUN_LENGTH_SECONDS = 100;
const CENTER_X = 320;
const CENTER_Y = 332;
const LANE_RADII = [90, 140, 190, 240] as const;
const HAZARD_ORDER: HazardKind[] = ["pinch", "sweep", "rake"];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAngle(angle: number): number {
  let result = angle % TAU;
  if (result > Math.PI) result -= TAU;
  if (result < -Math.PI) result += TAU;
  return result;
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pointOnRing(angle: number, radius: number): { x: number; y: number } {
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const game: SearchForFunGame = {
  id: "n_0007_orbitbound_three_beat_clamp",
  title: "Orbitbound: Three-Beat Clamp",
  instructions: "Left/right orbit. Up/down hop rings. Read each teal clamp beat.",

  mount(k: KAPLAYCtx, playtest: PlaytestApi, runtime: NodeRuntimeContext) {
    const random = makeRandom(runtime.seed);
    const enemies: Enemy[] = [];
    const projectiles: Projectile[] = [];
    const pickups: Pickup[] = [];
    const hazards: RingHazard[] = [];

    const paper = k.rgb(231, 234, 239);
    const pale = k.rgb(150, 158, 170);
    const dim = k.rgb(63, 69, 80);
    const dark = k.rgb(17, 20, 27);
    const accent = k.rgb(69, 224, 205);

    let started = false;
    let ended = false;
    let elapsed = 0;
    let firstInputRecorded = false;
    let playerAngle = -Math.PI / 2;
    let facing = 1;
    let lane = 2;
    let displayRadius = LANE_RADII[lane];
    let jumping = false;
    let jumpTime = 0;
    let jumpFromLane = lane;
    let jumpToLane = lane;
    let health = 4;
    let invulnerability = 0;
    let spawnTimer = 0.35;
    let fireTimer = 0.2;
    let nextHazardAt = 1.8;
    let hazardWave = 0;
    let kills = 0;
    let energy = 0;
    let laneHops = 0;
    let powerLevel = 1;
    let nextMilestone = 0;
    let flashText = "";
    let flashTimer = 0;

    const milestoneTimes = [20, 43, 68, 86];
    const energyThresholds = [4, 10, 18, 28];
    const faced: Record<HazardKind, number> = { pinch: 0, sweep: 0, rake: 0 };
    const evaded: Record<HazardKind, number> = { pinch: 0, sweep: 0, rake: 0 };
    const hit: Record<HazardKind, number> = { pinch: 0, sweep: 0, rake: 0 };

    function playerPosition(): { x: number; y: number } {
      return pointOnRing(playerAngle, displayRadius);
    }

    function isAirborne(): boolean {
      if (!jumping) return false;
      const progress = jumpTime / 0.38;
      return progress > 0.16 && progress < 0.84;
    }

    const initialPosition = playerPosition();
    const player = k.add([
      k.pos(initialPosition.x, initialPosition.y),
      k.scale(1),
      k.rotate(0),
      k.z(30),
      "player",
    ]);
    player.add([
      k.circle(21),
      k.pos(0, 0),
      k.anchor("center"),
      k.color(accent),
      k.opacity(0.17),
      k.z(-2),
    ]);
    player.add([
      k.circle(10),
      k.pos(0, 0),
      k.anchor("center"),
      k.color(paper),
      k.outline(3, accent),
      k.z(1),
    ]);
    player.add([
      k.polygon([k.vec2(8, 0), k.vec2(-4, -4), k.vec2(-4, 4)]),
      k.pos(9, 0),
      k.anchor("center"),
      k.color(dark),
      k.z(2),
      "player-crest",
    ]);

    function begin(action: string): void {
      if (ended) return;
      if (!started) {
        started = true;
        playtest.start();
      }
      if (!firstInputRecorded) {
        firstInputRecorded = true;
        playtest.event("first_input", { action, elapsed_ms: Math.round(elapsed * 1000) });
      }
    }

    function setPower(levelValue: number, source: "pickup" | "survival"): void {
      const next = clamp(levelValue, 1, 5);
      if (next <= powerLevel) return;
      powerLevel = next;
      flashText = `VOLLEY ${powerLevel}`;
      flashTimer = 1.25;
      playtest.event("goal", {
        kind: "power_up",
        power_level: powerLevel,
        source,
        kills,
        elapsed_s: Math.round(elapsed),
      });
    }

    function responseLabel(hazard: RingHazard): string {
      if (hazard.respondedHop && hazard.respondedOrbit) return "hop_and_orbit";
      if (hazard.respondedHop) return "hop";
      if (hazard.respondedOrbit) return "orbit";
      return "none";
    }

    function recordResponse(hazard: RingHazard, response: "lane_hop" | "orbit"): void {
      if (response === "lane_hop") {
        if (hazard.respondedHop) return;
        hazard.respondedHop = true;
      } else {
        if (hazard.respondedOrbit) return;
        hazard.respondedOrbit = true;
      }
      playtest.event("decision", {
        kind: "hazard_response",
        variation: hazard.kind,
        response,
        wave: hazard.wave,
        elapsed_s: Math.round(elapsed * 10) / 10,
      });
    }

    function hop(direction: -1 | 1): void {
      if (ended || jumping) return;
      const target = clamp(lane + direction, 0, LANE_RADII.length - 1);
      if (target === lane) {
        flashText = direction < 0 ? "INNER EDGE" : "OUTER EDGE";
        flashTimer = 0.55;
        return;
      }

      const start = playerPosition();
      const nearby = enemies.some((enemy) => squaredDistance(start.x, start.y, enemy.actor.pos.x, enemy.actor.pos.y) < 58 * 58);
      const activeHazard = hazards[0];
      jumping = true;
      jumpTime = 0;
      jumpFromLane = lane;
      jumpToLane = target;
      laneHops += 1;
      if (activeHazard) recordResponse(activeHazard, "lane_hop");
      playtest.event("decision", {
        kind: "lane_hop",
        from_lane: jumpFromLane + 1,
        to_lane: jumpToLane + 1,
        direction: direction < 0 ? "in" : "out",
        airborne_near_enemy: nearby,
        hazard_variation: activeHazard?.kind ?? "none",
        elapsed_s: Math.round(elapsed * 10) / 10,
      });
    }

    function makeEnemyActor(angle: number, radius: number, size: number, sturdy: boolean): GameObj {
      const point = pointOnRing(angle, radius);
      const actor = k.add([k.pos(point.x, point.y), k.z(12), "enemy", "moving-threat"]);
      actor.add([
        k.polygon([k.vec2(0, -size), k.vec2(size, 0), k.vec2(0, size), k.vec2(-size, 0)]),
        k.pos(0, 0),
        k.anchor("center"),
        k.color(sturdy ? pale : dim),
        k.outline(1, paper),
      ]);
      if (sturdy) {
        actor.add([k.circle(3), k.pos(0, 0), k.anchor("center"), k.color(dark), k.z(1)]);
      }
      return actor;
    }

    function spawnEnemy(forcedAngle?: number): void {
      if (enemies.length >= 92) return;
      const angle = forcedAngle ?? random() * TAU;
      const sturdy = elapsed > 38 && random() < 0.16 + elapsed / 520;
      const hp = sturdy ? 2 : 1;
      const radius = 286 + random() * 18;
      const size = sturdy ? 11 : 8;
      enemies.push({
        actor: makeEnemyActor(angle, radius, size, sturdy),
        angle,
        radius,
        radialSpeed: 22 + random() * 13 + elapsed * 0.09,
        drift: (random() - 0.5) * (0.16 + elapsed * 0.0018),
        hp,
        size,
      });
    }

    function nearestEnemy(origin: { x: number; y: number }): Enemy | undefined {
      let nearest: Enemy | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const enemy of enemies) {
        const distance = squaredDistance(origin.x, origin.y, enemy.actor.pos.x, enemy.actor.pos.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = enemy;
        }
      }
      return nearest;
    }

    function destroyProjectile(index: number): void {
      const shot = projectiles[index];
      if (!shot) return;
      shot.actor.destroy();
      projectiles.splice(index, 1);
    }

    function fireVolley(): void {
      const origin = playerPosition();
      const target = nearestEnemy(origin);
      if (!target) return;
      const baseAngle = Math.atan2(target.actor.pos.y - origin.y, target.actor.pos.x - origin.x);
      const spreads = powerLevel === 1
        ? [0]
        : powerLevel === 2
          ? [-0.07, 0.07]
          : powerLevel === 3
            ? [-0.14, 0, 0.14]
            : powerLevel === 4
              ? [-0.19, -0.06, 0.06, 0.19]
              : [-0.26, -0.13, 0, 0.13, 0.26];

      for (const spread of spreads) {
        const shotAngle = baseAngle + spread;
        const actor = k.add([
          k.circle(powerLevel >= 4 ? 4 : 3),
          k.pos(origin.x, origin.y),
          k.anchor("center"),
          k.color(accent),
          k.z(20),
          "projectile",
        ]);
        projectiles.push({
          actor,
          x: origin.x,
          y: origin.y,
          vx: Math.cos(shotAngle) * 395,
          vy: Math.sin(shotAngle) * 395,
          ttl: 1.25,
        });
      }
    }

    function dropPickup(enemy: Enemy): void {
      if (random() > 0.72) return;
      const x = enemy.actor.pos.x;
      const y = enemy.actor.pos.y;
      const actor = k.add([
        k.polygon([k.vec2(0, -6), k.vec2(6, 0), k.vec2(0, 6), k.vec2(-6, 0)]),
        k.pos(x, y),
        k.anchor("center"),
        k.color(accent),
        k.scale(1),
        k.z(16),
        "pickup",
      ]);
      pickups.push({ actor, x, y, ttl: 11, spin: random() * TAU });
    }

    function removeEnemy(index: number, defeated: boolean): void {
      const enemy = enemies[index];
      if (!enemy) return;
      if (defeated) {
        dropPickup(enemy);
        kills += 1;
      }
      enemy.actor.destroy();
      enemies.splice(index, 1);
    }

    function makeClampTooth(laneIndex: number, angle: number, wide: boolean): GameObj {
      const point = pointOnRing(angle, LANE_RADII[laneIndex]);
      const actor = k.add([
        k.pos(point.x, point.y),
        k.scale(1),
        k.rotate(0),
        k.z(25),
        "ring-hazard",
        "moving-threat",
      ]);
      actor.add([
        k.polygon(wide
          ? [k.vec2(-15, -8), k.vec2(15, -8), k.vec2(20, 0), k.vec2(15, 8), k.vec2(-15, 8)]
          : [k.vec2(0, -17), k.vec2(10, 0), k.vec2(0, 17), k.vec2(-10, 0)]),
        k.pos(0, 0),
        k.anchor("center"),
        k.color(accent),
        k.outline(2, paper),
      ]);
      actor.add([k.circle(wide ? 22 : 18), k.pos(0, 0), k.anchor("center"), k.color(accent), k.opacity(0.09), k.z(-1)]);
      return actor;
    }

    function safeLaneForRake(): number {
      if (lane === 0) return 1;
      if (lane === LANE_RADII.length - 1) return lane - 1;
      return random() < 0.5 ? lane - 1 : lane + 1;
    }

    function spawnHazard(): void {
      const kind = HAZARD_ORDER[hazardWave % HAZARD_ORDER.length];
      hazardWave += 1;
      const targetLane = lane;
      const centerAngle = playerAngle;
      const safeLane = kind === "rake" ? safeLaneForRake() : null;
      const blockedLanes = kind === "rake"
        ? [0, 1, 2, 3].filter((candidate) => candidate !== safeLane)
        : [targetLane];
      const duration = kind === "pinch" ? 1.35 : kind === "sweep" ? 1.65 : 1.75;
      const actors = kind === "pinch"
        ? [
            makeClampTooth(targetLane, centerAngle - 0.88, false),
            makeClampTooth(targetLane, centerAngle + 0.88, false),
          ]
        : blockedLanes.map((blockedLane) => makeClampTooth(blockedLane, centerAngle - (kind === "sweep" ? 1.35 : 0.62), true));

      const hazard: RingHazard = {
        actors,
        kind,
        targetLane,
        blockedLanes,
        safeLane,
        centerAngle,
        age: 0,
        duration,
        wave: hazardWave,
        respondedHop: false,
        respondedOrbit: false,
        angleAtWarning: playerAngle,
      };
      hazards.push(hazard);
      flashText = kind === "pinch"
        ? "PINCH · HOP / ORBIT"
        : kind === "sweep"
          ? "SWEEP · MOVE"
          : `RAKE · RING ${safeLane! + 1} OPEN`;
      flashTimer = duration;
      playtest.event("decision", {
        kind: "hazard_warning",
        variation: kind,
        wave: hazardWave,
        target_lane: targetLane + 1,
        safe_lane: safeLane === null ? null : safeLane + 1,
        warning_s: duration,
        elapsed_s: Math.round(elapsed * 10) / 10,
      });
    }

    function resolveHazard(index: number): void {
      const hazard = hazards[index];
      if (!hazard) return;
      faced[hazard.kind] += 1;
      const angularDistance = Math.abs(normalizeAngle(playerAngle - hazard.centerAngle));
      const inBlockedLane = hazard.blockedLanes.includes(lane);
      const unsafe = inBlockedLane && !isAirborne() && angularDistance < (hazard.kind === "pinch" ? 0.38 : 0.32);
      const response = responseLabel(hazard);

      if (unsafe) {
        hit[hazard.kind] += 1;
        const absorbed = invulnerability > 0;
        if (!absorbed) {
          health -= 1;
          invulnerability = 1.1;
        }
        flashText = `${hazard.kind.toUpperCase()} HIT`;
        flashTimer = 0.65;
        playtest.event("damage", {
          source: "ring_hazard",
          variation: hazard.kind,
          wave: hazard.wave,
          response,
          absorbed,
          health,
          elapsed_s: Math.round(elapsed * 10) / 10,
        });
        if (health <= 0) finish("overwhelmed");
      } else {
        evaded[hazard.kind] += 1;
        flashText = `${hazard.kind.toUpperCase()} CLEAR`;
        flashTimer = 0.55;
        playtest.event("goal", {
          kind: "hazard_evaded",
          variation: hazard.kind,
          wave: hazard.wave,
          response,
          end_lane: lane + 1,
          elapsed_s: Math.round(elapsed * 10) / 10,
        });
      }

      for (const actor of hazard.actors) actor.destroy();
      hazards.splice(index, 1);
    }

    function finish(outcome: "survived" | "overwhelmed"): void {
      if (ended) return;
      ended = true;
      const summary = {
        outcome,
        elapsed_s: Math.round(elapsed),
        kills,
        power_level: powerLevel,
        lane_hops: laneHops,
        pinch_faced: faced.pinch,
        pinch_evaded: evaded.pinch,
        pinch_hits: hit.pinch,
        sweep_faced: faced.sweep,
        sweep_evaded: evaded.sweep,
        sweep_hits: hit.sweep,
        rake_faced: faced.rake,
        rake_evaded: evaded.rake,
        rake_hits: hit.rake,
      };
      playtest.event(outcome === "survived" ? "goal" : "death", summary);
      playtest.event("round_end", summary);
      if (outcome === "survived") playtest.complete(summary);
      else playtest.fail("The orbit runner was overwhelmed");
    }

    const inputHandles = [
      k.onButtonPress("left", () => begin("left")),
      k.onButtonPress("right", () => begin("right")),
      k.onButtonPress("up", () => {
        begin("up");
        hop(1);
      }),
      k.onButtonPress("down", () => {
        begin("down");
        hop(-1);
      }),
      k.onButtonPress("restart", () => playtest.restart()),
    ];

    const updateHandle = k.onUpdate(() => {
      const dt = Math.min(k.dt(), 0.05);
      if (ended || !started) return;

      elapsed += dt;
      invulnerability = Math.max(0, invulnerability - dt);
      flashTimer = Math.max(0, flashTimer - dt);

      let movement = 0;
      if (k.isButtonDown("left")) movement -= 1;
      if (k.isButtonDown("right")) movement += 1;
      if (movement !== 0) {
        facing = movement;
        const angularSpeed = 2.1 * (170 / displayRadius);
        playerAngle = normalizeAngle(playerAngle + movement * angularSpeed * dt);
        for (const hazard of hazards) {
          if (Math.abs(normalizeAngle(playerAngle - hazard.angleAtWarning)) > 0.24) {
            recordResponse(hazard, "orbit");
          }
        }
      }

      if (jumping) {
        jumpTime += dt;
        const progress = clamp(jumpTime / 0.38, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        displayRadius = LANE_RADII[jumpFromLane]
          + (LANE_RADII[jumpToLane] - LANE_RADII[jumpFromLane]) * eased;
        if (progress >= 1) {
          lane = jumpToLane;
          displayRadius = LANE_RADII[lane];
          jumping = false;
        }
      }

      const currentPlayerPosition = playerPosition();
      const jumpArc = jumping ? Math.sin(clamp(jumpTime / 0.38, 0, 1) * Math.PI) : 0;
      player.pos = k.vec2(currentPlayerPosition.x, currentPlayerPosition.y);
      player.scaleTo(1 + jumpArc * 0.16);
      player.angle = Math.atan2(Math.cos(playerAngle) * facing, -Math.sin(playerAngle) * facing) * 57.2958;

      while (nextMilestone < milestoneTimes.length && elapsed >= milestoneTimes[nextMilestone]) {
        nextMilestone += 1;
        setPower(nextMilestone + 1, "survival");
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const firstAngle = random() * TAU;
        spawnEnemy(firstAngle);
        if (elapsed > 48 && random() < 0.15 + elapsed / 500) {
          spawnEnemy(firstAngle + 0.16 + random() * 0.2);
        }
        spawnTimer += Math.max(0.24, 0.88 - elapsed * 0.0062);
      }

      if (hazards.length === 0 && elapsed >= nextHazardAt) {
        spawnHazard();
        nextHazardAt = elapsed + (hazardWave < 3 ? 3.9 : Math.max(4.4, 5.4 - elapsed * 0.006));
      }

      fireTimer -= dt;
      if (fireTimer <= 0) {
        fireVolley();
        fireTimer += Math.max(0.19, 0.55 - powerLevel * 0.055);
      }

      for (let index = hazards.length - 1; index >= 0; index -= 1) {
        const hazard = hazards[index];
        hazard.age += dt;
        const progress = clamp(hazard.age / hazard.duration, 0, 1);

        if (hazard.kind === "pinch") {
          const offset = 0.88 * (1 - progress);
          const angles = [hazard.centerAngle - offset, hazard.centerAngle + offset];
          for (let actorIndex = 0; actorIndex < hazard.actors.length; actorIndex += 1) {
            const actor = hazard.actors[actorIndex];
            const point = pointOnRing(angles[actorIndex], LANE_RADII[hazard.targetLane]);
            actor.pos = k.vec2(point.x, point.y);
            actor.scaleTo(0.82 + progress * 0.46);
          }
        } else {
          const startOffset = hazard.kind === "sweep" ? -1.35 : -0.62;
          const angle = hazard.centerAngle + startOffset * (1 - progress);
          for (let actorIndex = 0; actorIndex < hazard.actors.length; actorIndex += 1) {
            const actor = hazard.actors[actorIndex];
            const actorLane = hazard.blockedLanes[actorIndex];
            const point = pointOnRing(angle, LANE_RADII[actorLane]);
            actor.pos = k.vec2(point.x, point.y);
            actor.angle = angle * 57.2958 + 90;
            actor.scaleTo(0.86 + progress * 0.34);
          }
        }

        if (progress >= 1) resolveHazard(index);
      }

      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        const angularPull = clamp(normalizeAngle(playerAngle - enemy.angle), -0.8, 0.8);
        enemy.angle = normalizeAngle(enemy.angle + (enemy.drift + angularPull * 0.11) * dt);
        enemy.radius -= enemy.radialSpeed * dt;
        const point = pointOnRing(enemy.angle, enemy.radius);
        enemy.actor.pos = k.vec2(point.x, point.y);

        if (enemy.radius < 40) {
          removeEnemy(index, false);
          continue;
        }

        if (
          invulnerability <= 0
          && !isAirborne()
          && squaredDistance(currentPlayerPosition.x, currentPlayerPosition.y, point.x, point.y) < (enemy.size + 11) ** 2
        ) {
          health -= 1;
          invulnerability = 1.1;
          removeEnemy(index, false);
          flashText = "CONTACT";
          flashTimer = 0.6;
          playtest.event("damage", {
            source: "enemy_contact",
            health,
            elapsed_s: Math.round(elapsed),
            lane: lane + 1,
          });
          if (health <= 0) finish("overwhelmed");
        }
      }

      for (let shotIndex = projectiles.length - 1; shotIndex >= 0; shotIndex -= 1) {
        const shot = projectiles[shotIndex];
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.ttl -= dt;
        shot.actor.pos = k.vec2(shot.x, shot.y);
        let didHit = false;

        for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = enemies[enemyIndex];
          if (squaredDistance(shot.x, shot.y, enemy.actor.pos.x, enemy.actor.pos.y) > (enemy.size + 4) ** 2) continue;
          enemy.hp -= 1;
          didHit = true;
          if (enemy.hp <= 0) removeEnemy(enemyIndex, true);
          break;
        }

        if (didHit || shot.ttl <= 0 || shot.x < -20 || shot.x > 660 || shot.y < -20 || shot.y > 660) {
          destroyProjectile(shotIndex);
        }
      }

      for (let index = pickups.length - 1; index >= 0; index -= 1) {
        const pickup = pickups[index];
        pickup.ttl -= dt;
        pickup.spin += dt * 4.2;
        const dx = currentPlayerPosition.x - pickup.x;
        const dy = currentPlayerPosition.y - pickup.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 96 * 96 && distanceSquared > 1) {
          const distance = Math.sqrt(distanceSquared);
          const pull = distance < 44 ? 245 : 92;
          pickup.x += dx / distance * pull * dt;
          pickup.y += dy / distance * pull * dt;
        }
        pickup.actor.pos = k.vec2(pickup.x, pickup.y);
        pickup.actor.scaleTo(1 + Math.sin(pickup.spin) * 0.16);
        if (distanceSquared < 17 * 17) {
          pickup.actor.destroy();
          pickups.splice(index, 1);
          energy += 1;
          let pickupLevel = 1;
          for (const threshold of energyThresholds) {
            if (energy >= threshold) pickupLevel += 1;
          }
          setPower(pickupLevel, "pickup");
        } else if (pickup.ttl <= 0) {
          pickup.actor.destroy();
          pickups.splice(index, 1);
        }
      }

      if (!ended && elapsed >= RUN_LENGTH_SECONDS) finish("survived");
    });

    const drawHandle = k.onDraw(() => {
      k.drawCircle({
        pos: k.vec2(CENTER_X, CENTER_Y),
        radius: 47,
        color: dark,
        outline: { width: 2, color: dim, opacity: 0.8 },
      });
      k.drawCircle({ pos: k.vec2(CENTER_X, CENTER_Y), radius: 8, color: dim });

      for (let index = 0; index < LANE_RADII.length; index += 1) {
        const selected = index === lane || (jumping && index === jumpToLane);
        const rakeSafe = hazards.some((hazard) => hazard.kind === "rake" && hazard.safeLane === index);
        k.drawCircle({
          pos: k.vec2(CENTER_X, CENTER_Y),
          radius: LANE_RADII[index],
          fill: false,
          color: rakeSafe || selected ? accent : dim,
          opacity: rakeSafe ? 0.84 : selected ? 0.48 : 0.68,
          outline: { width: rakeSafe ? 4 : selected ? 3 : 2, color: rakeSafe || selected ? accent : dim },
        });
        for (let tick = 0; tick < 12; tick += 1) {
          const angle = tick / 12 * TAU;
          const inner = pointOnRing(angle, LANE_RADII[index] - 3);
          const outer = pointOnRing(angle, LANE_RADII[index] + 3);
          k.drawLine({
            p1: k.vec2(inner.x, inner.y),
            p2: k.vec2(outer.x, outer.y),
            width: rakeSafe ? 2 : 1,
            color: rakeSafe || selected ? accent : dim,
            opacity: rakeSafe ? 0.9 : selected ? 0.42 : 0.5,
          });
        }
      }

      for (const hazard of hazards) {
        const progress = clamp(hazard.age / hazard.duration, 0, 1);
        const halfArc = hazard.kind === "pinch" ? 0.9 * (1 - progress) + 0.2 : 0.36;
        for (let marker = -3; marker <= 3; marker += 1) {
          const angle = hazard.centerAngle + marker / 3 * halfArc;
          for (const blockedLane of hazard.blockedLanes) {
            const inner = pointOnRing(angle, LANE_RADII[blockedLane] - 4);
            const outer = pointOnRing(angle, LANE_RADII[blockedLane] + 4);
            k.drawLine({
              p1: k.vec2(inner.x, inner.y),
              p2: k.vec2(outer.x, outer.y),
              width: 3,
              color: accent,
              opacity: 0.28 + progress * 0.55,
            });
          }
        }
      }

      if (jumping) {
        const from = pointOnRing(playerAngle, LANE_RADII[jumpFromLane]);
        const now = playerPosition();
        k.drawLine({
          p1: k.vec2(from.x, from.y),
          p2: k.vec2(now.x, now.y),
          width: 4,
          color: accent,
          opacity: 0.28,
        });
      }

      k.drawText({
        text: `TIME ${Math.max(0, Math.ceil(RUN_LENGTH_SECONDS - elapsed)).toString().padStart(3, "0")}`,
        pos: k.vec2(22, 19),
        size: 18,
        color: paper,
      });
      k.drawText({
        text: `KILLS ${kills.toString().padStart(3, "0")}`,
        pos: k.vec2(618, 19),
        size: 18,
        color: paper,
        anchor: "topright",
      });
      k.drawText({ text: `RING ${lane + 1}`, pos: k.vec2(22, 48), size: 13, color: pale });
      k.drawText({
        text: `VOLLEY ${powerLevel}`,
        pos: k.vec2(618, 48),
        size: 13,
        color: accent,
        anchor: "topright",
      });

      for (let index = 0; index < 4; index += 1) {
        k.drawRect({
          pos: k.vec2(292 + index * 19, 22),
          width: 12,
          height: 7,
          radius: 2,
          color: index < health ? paper : dim,
        });
      }

      if (!started) {
        k.drawRect({
          pos: k.vec2(320, 568),
          width: 392,
          height: 42,
          anchor: "center",
          radius: 8,
          color: dark,
          outline: { width: 2, color: dim },
        });
        k.drawText({
          text: "←/→ ORBIT   ↑/↓ HOP   READ TEAL",
          pos: k.vec2(320, 568),
          size: 16,
          color: paper,
          anchor: "center",
        });
      }

      if (flashTimer > 0 && !ended) {
        k.drawText({
          text: flashText,
          pos: k.vec2(320, 88),
          size: 18,
          color: accent,
          anchor: "center",
          opacity: clamp(flashTimer, 0, 1),
        });
      }

      if (ended) {
        k.drawRect({
          pos: k.vec2(320, 332),
          width: 420,
          height: 102,
          anchor: "center",
          radius: 10,
          color: dark,
          opacity: 0.94,
          outline: { width: 2, color: health > 0 ? accent : pale },
        });
        k.drawText({
          text: health > 0 ? "ORBIT HELD" : "OVERWHELMED",
          pos: k.vec2(320, 310),
          size: 24,
          color: health > 0 ? accent : paper,
          anchor: "center",
        });
        k.drawText({
          text: `${kills} KILLS · ${evaded.pinch + evaded.sweep + evaded.rake}/${faced.pinch + faced.sweep + faced.rake} CLEAR · R RESTARTS`,
          pos: k.vec2(320, 347),
          size: 14,
          color: pale,
          anchor: "center",
        });
      }
    });

    playtest.ready();
    return () => {
      for (const handle of inputHandles) handle.cancel();
      updateHandle.cancel();
      drawHandle.cancel();
    };
  },
};

export default game;
