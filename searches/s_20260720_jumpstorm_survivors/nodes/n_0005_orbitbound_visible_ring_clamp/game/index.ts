import type { GameObj, KAPLAYCtx } from "kaplay";
import type {
  NodeRuntimeContext,
  PlaytestApi,
  SearchForFunGame,
} from "@search-for-fun/runtime";

interface Enemy {
  actor: GameObj;
  angle: number;
  radius: number;
  radialSpeed: number;
  drift: number;
  hp: number;
  maxHp: number;
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

interface RingClamp {
  left: GameObj;
  right: GameObj;
  targetLane: number;
  centerAngle: number;
  age: number;
  duration: number;
  wave: number;
}

const TAU = Math.PI * 2;
const RUN_LENGTH_SECONDS = 100;
const CENTER_X = 320;
const CENTER_Y = 332;
const LANE_RADII = [90, 140, 190, 240] as const;

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
  id: "n_0005_orbitbound_visible_ring_clamp",
  title: "Orbitbound: Visible Ring Clamp",
  instructions: "Left/right orbit. Up/down hop rings. Hop off the flashing ring before its clamp closes.",

  mount(k: KAPLAYCtx, playtest: PlaytestApi, runtime: NodeRuntimeContext) {
    const random = makeRandom(runtime.seed);
    const enemies: Enemy[] = [];
    const projectiles: Projectile[] = [];
    const pickups: Pickup[] = [];
    const ringClamps: RingClamp[] = [];

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
    let spawnTimer = 0.45;
    let fireTimer = 0.2;
    let clampTimer = 2.8;
    let clampWave = 0;
    let clampsFaced = 0;
    let clampsAvoided = 0;
    let firstClampMeasured = false;
    let kills = 0;
    let energy = 0;
    let laneHops = 0;
    let pressureHops = 0;
    let powerLevel = 1;
    let nextMilestone = 0;
    let flashText = "";
    let flashTimer = 0;

    const milestoneTimes = [20, 43, 68, 86];
    const energyThresholds = [4, 10, 18, 28];

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
      flashTimer = 1.7;
      playtest.event("goal", {
        kind: "power_up",
        power_level: powerLevel,
        source,
        kills,
        elapsed_s: Math.round(elapsed),
      });
    }

    function clampThreatensLane(laneIndex: number): boolean {
      return ringClamps.some((threat) => threat.targetLane === laneIndex && threat.age < threat.duration);
    }

    function hop(direction: -1 | 1): void {
      if (ended || jumping) return;
      const target = clamp(lane + direction, 0, LANE_RADII.length - 1);
      if (target === lane) {
        flashText = direction < 0 ? "INNER EDGE" : "OUTER EDGE";
        flashTimer = 0.65;
        return;
      }

      const start = playerPosition();
      const nearby = enemies.some((enemy) => squaredDistance(start.x, start.y, enemy.actor.pos.x, enemy.actor.pos.y) < 58 * 58);
      const underClamp = clampThreatensLane(lane);
      jumping = true;
      jumpTime = 0;
      jumpFromLane = lane;
      jumpToLane = target;
      laneHops += 1;
      if (underClamp) pressureHops += 1;
      playtest.event("decision", {
        kind: "lane_hop",
        from_lane: jumpFromLane + 1,
        to_lane: jumpToLane + 1,
        direction: direction < 0 ? "in" : "out",
        airborne_near_enemy: nearby,
        under_clamp: underClamp,
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
        maxHp: hp,
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

    function makeClampTooth(radius: number, angle: number): GameObj {
      const point = pointOnRing(angle, radius);
      const actor = k.add([k.pos(point.x, point.y), k.scale(1), k.z(25), "ring-clamp", "moving-threat"]);
      actor.add([
        k.polygon([k.vec2(0, -17), k.vec2(10, 0), k.vec2(0, 17), k.vec2(-10, 0)]),
        k.pos(0, 0),
        k.anchor("center"),
        k.color(accent),
        k.outline(2, paper),
      ]);
      actor.add([k.circle(18), k.pos(0, 0), k.anchor("center"), k.color(accent), k.opacity(0.1), k.z(-1)]);
      return actor;
    }

    function spawnRingClamp(): void {
      clampWave += 1;
      const targetLane = lane;
      const centerAngle = playerAngle;
      const radius = LANE_RADII[targetLane];
      const duration = Math.max(1.55, 2.6 - elapsed * 0.008);
      ringClamps.push({
        left: makeClampTooth(radius, centerAngle - 1.04),
        right: makeClampTooth(radius, centerAngle + 1.04),
        targetLane,
        centerAngle,
        age: 0,
        duration,
        wave: clampWave,
      });
      flashText = `RING ${targetLane + 1} CLAMP  •  HOP`;
      flashTimer = Math.min(2.1, duration - 0.15);
      playtest.event("decision", {
        kind: "clamp_warning",
        wave: clampWave,
        target_lane: targetLane + 1,
        warning_s: Math.round(duration * 10) / 10,
        elapsed_s: Math.round(elapsed * 10) / 10,
      });
    }

    function resolveRingClamp(index: number): void {
      const threat = ringClamps[index];
      if (!threat) return;
      clampsFaced += 1;
      const avoided = lane !== threat.targetLane || isAirborne();
      if (avoided) {
        clampsAvoided += 1;
        flashText = "CLAMP EVADED";
        flashTimer = 0.8;
        if (!firstClampMeasured) {
          firstClampMeasured = true;
          playtest.event("goal", {
            kind: "first_clamp_evaded",
            wave: threat.wave,
            lane_hops: laneHops,
            pressure_hops: pressureHops,
            elapsed_s: Math.round(elapsed * 10) / 10,
          });
        }
      } else if (invulnerability <= 0) {
        health -= 1;
        invulnerability = 1.25;
        flashText = "RING CLAMPED";
        flashTimer = 0.9;
        firstClampMeasured = true;
        playtest.event("damage", {
          source: "ring_clamp",
          health,
          wave: threat.wave,
          lane: lane + 1,
          elapsed_s: Math.round(elapsed * 10) / 10,
        });
        if (health <= 0) finish("overwhelmed");
      }
      threat.left.destroy();
      threat.right.destroy();
      ringClamps.splice(index, 1);
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
        pressure_hops: pressureHops,
        clamps_faced: clampsFaced,
        clamps_avoided: clampsAvoided,
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

      clampTimer -= dt;
      if (clampTimer <= 0) {
        spawnRingClamp();
        const interval = Math.max(4.5, 7.2 - elapsed * 0.022);
        clampTimer += interval;
      }

      fireTimer -= dt;
      if (fireTimer <= 0) {
        fireVolley();
        fireTimer += Math.max(0.19, 0.55 - powerLevel * 0.055);
      }

      for (let index = ringClamps.length - 1; index >= 0; index -= 1) {
        const threat = ringClamps[index];
        threat.age += dt;
        const tracking = clamp(normalizeAngle(playerAngle - threat.centerAngle), -0.52 * dt, 0.52 * dt);
        threat.centerAngle = normalizeAngle(threat.centerAngle + tracking);
        const progress = clamp(threat.age / threat.duration, 0, 1);
        const offset = 1.04 * (1 - progress);
        const radius = LANE_RADII[threat.targetLane];
        const leftPoint = pointOnRing(threat.centerAngle - offset, radius);
        const rightPoint = pointOnRing(threat.centerAngle + offset, radius);
        threat.left.pos = k.vec2(leftPoint.x, leftPoint.y);
        threat.right.pos = k.vec2(rightPoint.x, rightPoint.y);
        threat.left.scaleTo(0.8 + progress * 0.55);
        threat.right.scaleTo(0.8 + progress * 0.55);
        if (progress >= 1) resolveRingClamp(index);
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
          invulnerability = 1.25;
          removeEnemy(index, false);
          flashText = "HIT";
          flashTimer = 0.8;
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
        let hit = false;

        for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = enemies[enemyIndex];
          if (squaredDistance(shot.x, shot.y, enemy.actor.pos.x, enemy.actor.pos.y) > (enemy.size + 4) ** 2) continue;
          enemy.hp -= 1;
          hit = true;
          if (enemy.hp <= 0) removeEnemy(enemyIndex, true);
          break;
        }

        if (hit || shot.ttl <= 0 || shot.x < -20 || shot.x > 660 || shot.y < -20 || shot.y > 660) {
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
        const threat = ringClamps.find((candidate) => candidate.targetLane === index);
        const warning = threat ? clamp(threat.age / threat.duration, 0, 1) : 0;
        const warningPulse = threat ? 0.32 + Math.sin(threat.age * 11) * 0.16 + warning * 0.34 : 0;
        k.drawCircle({
          pos: k.vec2(CENTER_X, CENTER_Y),
          radius: LANE_RADII[index],
          fill: false,
          color: threat ? accent : selected ? accent : dim,
          opacity: threat ? warningPulse : selected ? 0.52 : 0.72,
          outline: { width: threat ? 5 : selected ? 3 : 2, color: threat ? accent : selected ? accent : dim },
        });
        for (let tick = 0; tick < 12; tick += 1) {
          const angle = tick / 12 * TAU;
          const inner = pointOnRing(angle, LANE_RADII[index] - 3);
          const outer = pointOnRing(angle, LANE_RADII[index] + 3);
          k.drawLine({
            p1: k.vec2(inner.x, inner.y),
            p2: k.vec2(outer.x, outer.y),
            width: threat ? 2 : 1,
            color: threat ? accent : selected ? accent : dim,
            opacity: threat ? 0.8 : selected ? 0.42 : 0.5,
          });
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
          width: 400,
          height: 42,
          anchor: "center",
          radius: 8,
          color: dark,
          outline: { width: 2, color: dim },
        });
        k.drawText({
          text: "←/→ ORBIT   ↑/↓ HOP THE FLASHING RING",
          pos: k.vec2(320, 568),
          size: 16,
          color: paper,
          anchor: "center",
        });
      }

      if (flashTimer > 0 && !ended) {
        k.drawText({
          text: flashText,
          pos: k.vec2(320, 89),
          size: 20,
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
          text: `${kills} KILLS · ${clampsAvoided}/${clampsFaced} CLAMPS · R RESTARTS`,
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
