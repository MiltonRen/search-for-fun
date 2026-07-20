import type { KAPLAYCtx } from "kaplay";
import type {
  NodeRuntimeContext,
  PlaytestApi,
  SearchForFunGame,
} from "@search-for-fun/runtime";

interface Enemy {
  angle: number;
  radius: number;
  radialSpeed: number;
  drift: number;
  hp: number;
  maxHp: number;
  size: number;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
}

interface Pickup {
  x: number;
  y: number;
  ttl: number;
  spin: number;
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
  id: "n_0001_orbitbound",
  title: "Orbitbound",
  instructions: "Left/right orbit. Up/down hop between rings. Your volley fires automatically.",

  mount(k: KAPLAYCtx, playtest: PlaytestApi, runtime: NodeRuntimeContext) {
    const random = makeRandom(runtime.seed);
    const enemies: Enemy[] = [];
    const projectiles: Projectile[] = [];
    const pickups: Pickup[] = [];

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
    let kills = 0;
    let energy = 0;
    let laneHops = 0;
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
      playtest.event("power_up", {
        power_level: powerLevel,
        source,
        kills,
        elapsed_s: Math.round(elapsed),
      });
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
      const nearby = enemies.some((enemy) => {
        const point = pointOnRing(enemy.angle, enemy.radius);
        return squaredDistance(start.x, start.y, point.x, point.y) < 58 * 58;
      });

      jumping = true;
      jumpTime = 0;
      jumpFromLane = lane;
      jumpToLane = target;
      laneHops += 1;
      playtest.event("lane_hop", {
        from_lane: jumpFromLane + 1,
        to_lane: jumpToLane + 1,
        direction: direction < 0 ? "in" : "out",
        airborne_near_enemy: nearby,
      });
    }

    function spawnEnemy(forcedAngle?: number): void {
      if (enemies.length >= 92) return;
      const angle = forcedAngle ?? random() * TAU;
      const sturdy = elapsed > 38 && random() < 0.16 + elapsed / 520;
      const hp = sturdy ? 2 : 1;
      enemies.push({
        angle,
        radius: 286 + random() * 18,
        radialSpeed: 22 + random() * 13 + elapsed * 0.09,
        drift: (random() - 0.5) * (0.16 + elapsed * 0.0018),
        hp,
        maxHp: hp,
        size: sturdy ? 11 : 8,
      });
    }

    function nearestEnemy(origin: { x: number; y: number }): Enemy | undefined {
      let nearest: Enemy | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const enemy of enemies) {
        const point = pointOnRing(enemy.angle, enemy.radius);
        const distance = squaredDistance(origin.x, origin.y, point.x, point.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = enemy;
        }
      }
      return nearest;
    }

    function fireVolley(): void {
      const origin = playerPosition();
      const target = nearestEnemy(origin);
      if (!target) return;
      const targetPoint = pointOnRing(target.angle, target.radius);
      const baseAngle = Math.atan2(targetPoint.y - origin.y, targetPoint.x - origin.x);
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
        projectiles.push({
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
      const point = pointOnRing(enemy.angle, enemy.radius);
      pickups.push({ x: point.x, y: point.y, ttl: 11, spin: random() * TAU });
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
      };
      playtest.event(outcome === "survived" ? "goal" : "death", summary);
      playtest.event("round_end", summary);
      if (outcome === "survived") playtest.complete(summary);
      else playtest.fail("The orbit runner was overwhelmed");
    }

    k.onButtonPress(["left", "right"], (button) => begin(button));
    k.onButtonPress(["up", "down"], (button) => {
      begin(button);
      hop(button === "up" ? 1 : -1);
    });

    k.onUpdate(() => {
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

      fireTimer -= dt;
      if (fireTimer <= 0) {
        fireVolley();
        fireTimer += Math.max(0.19, 0.55 - powerLevel * 0.055);
      }

      const player = playerPosition();
      for (let index = enemies.length - 1; index >= 0; index -= 1) {
        const enemy = enemies[index];
        const angularPull = clamp(normalizeAngle(playerAngle - enemy.angle), -0.8, 0.8);
        enemy.angle = normalizeAngle(enemy.angle + (enemy.drift + angularPull * 0.11) * dt);
        enemy.radius -= enemy.radialSpeed * dt;

        if (enemy.radius < 40) {
          enemies.splice(index, 1);
          continue;
        }

        const point = pointOnRing(enemy.angle, enemy.radius);
        if (
          invulnerability <= 0
          && !isAirborne()
          && squaredDistance(player.x, player.y, point.x, point.y) < (enemy.size + 11) ** 2
        ) {
          health -= 1;
          invulnerability = 1.25;
          enemies.splice(index, 1);
          flashText = "HIT";
          flashTimer = 0.8;
          playtest.event("damage", {
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
        let hit = false;

        for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
          const enemy = enemies[enemyIndex];
          const point = pointOnRing(enemy.angle, enemy.radius);
          if (squaredDistance(shot.x, shot.y, point.x, point.y) > (enemy.size + 4) ** 2) continue;
          enemy.hp -= 1;
          hit = true;
          if (enemy.hp <= 0) {
            dropPickup(enemy);
            enemies.splice(enemyIndex, 1);
            kills += 1;
          }
          break;
        }

        if (hit || shot.ttl <= 0 || shot.x < -20 || shot.x > 660 || shot.y < -20 || shot.y > 660) {
          projectiles.splice(shotIndex, 1);
        }
      }

      for (let index = pickups.length - 1; index >= 0; index -= 1) {
        const pickup = pickups[index];
        pickup.ttl -= dt;
        pickup.spin += dt * 4.2;
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 96 * 96 && distanceSquared > 1) {
          const distance = Math.sqrt(distanceSquared);
          const pull = distance < 44 ? 245 : 92;
          pickup.x += dx / distance * pull * dt;
          pickup.y += dy / distance * pull * dt;
        }
        if (distanceSquared < 17 * 17) {
          pickups.splice(index, 1);
          energy += 1;
          let pickupLevel = 1;
          for (const threshold of energyThresholds) {
            if (energy >= threshold) pickupLevel += 1;
          }
          setPower(pickupLevel, "pickup");
        } else if (pickup.ttl <= 0) {
          pickups.splice(index, 1);
        }
      }

      if (elapsed >= RUN_LENGTH_SECONDS) finish("survived");
    });

    k.onDraw(() => {
      const player = playerPosition();
      const jumpArc = jumping ? Math.sin(clamp(jumpTime / 0.38, 0, 1) * Math.PI) : 0;

      k.drawCircle({
        pos: k.vec2(CENTER_X, CENTER_Y),
        radius: 47,
        color: dark,
        outline: { width: 2, color: dim, opacity: 0.8 },
      });
      k.drawCircle({
        pos: k.vec2(CENTER_X, CENTER_Y),
        radius: 8,
        color: dim,
      });

      for (let index = 0; index < LANE_RADII.length; index += 1) {
        const selected = index === lane || (jumping && index === jumpToLane);
        k.drawCircle({
          pos: k.vec2(CENTER_X, CENTER_Y),
          radius: LANE_RADII[index],
          fill: false,
          color: selected ? accent : dim,
          opacity: selected ? 0.52 : 0.72,
          outline: { width: selected ? 3 : 2, color: selected ? accent : dim },
        });
        for (let tick = 0; tick < 12; tick += 1) {
          const angle = tick / 12 * TAU;
          const inner = pointOnRing(angle, LANE_RADII[index] - 3);
          const outer = pointOnRing(angle, LANE_RADII[index] + 3);
          k.drawLine({
            p1: k.vec2(inner.x, inner.y),
            p2: k.vec2(outer.x, outer.y),
            width: 1,
            color: selected ? accent : dim,
            opacity: selected ? 0.42 : 0.5,
          });
        }
      }

      for (const pickup of pickups) {
        const size = 5 + Math.sin(pickup.spin) * 1.2;
        k.drawPolygon({
          pos: k.vec2(pickup.x, pickup.y),
          pts: [k.vec2(0, -size), k.vec2(size, 0), k.vec2(0, size), k.vec2(-size, 0)],
          color: accent,
          angle: pickup.spin * 57.2958,
          opacity: clamp(pickup.ttl, 0.25, 1),
        });
      }

      for (const enemy of enemies) {
        const point = pointOnRing(enemy.angle, enemy.radius);
        const enemyColor = enemy.maxHp > 1 ? pale : dim;
        k.drawPolygon({
          pos: k.vec2(point.x, point.y),
          pts: [
            k.vec2(0, -enemy.size),
            k.vec2(enemy.size, 0),
            k.vec2(0, enemy.size),
            k.vec2(-enemy.size, 0),
          ],
          color: enemyColor,
          angle: enemy.angle * 57.2958 + 45,
          outline: { width: 1, color: paper, opacity: enemy.maxHp > 1 ? 0.5 : 0.16 },
        });
        if (enemy.hp < enemy.maxHp) {
          k.drawCircle({ pos: k.vec2(point.x, point.y), radius: 3, color: dark });
        }
      }

      for (const shot of projectiles) {
        k.drawCircle({
          pos: k.vec2(shot.x, shot.y),
          radius: powerLevel >= 4 ? 4 : 3,
          color: accent,
        });
      }

      if (jumping) {
        const from = pointOnRing(playerAngle, LANE_RADII[jumpFromLane]);
        k.drawLine({
          p1: k.vec2(from.x, from.y),
          p2: k.vec2(player.x, player.y),
          width: 4,
          color: accent,
          opacity: 0.26,
        });
      }

      const tangentX = -Math.sin(playerAngle) * facing;
      const tangentY = Math.cos(playerAngle) * facing;
      const heroRadius = 10 + jumpArc * 4;
      k.drawCircle({
        pos: k.vec2(player.x, player.y),
        radius: heroRadius,
        color: invulnerability > 0 && Math.floor(invulnerability * 12) % 2 === 0 ? dim : paper,
        outline: { width: 3, color: accent },
      });
      k.drawPolygon({
        pos: k.vec2(player.x + tangentX * 8, player.y + tangentY * 8),
        pts: [k.vec2(7, 0), k.vec2(-4, -4), k.vec2(-4, 4)],
        angle: Math.atan2(tangentY, tangentX) * 57.2958,
        color: dark,
      });

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
      k.drawText({
        text: `RING ${lane + 1}`,
        pos: k.vec2(22, 48),
        size: 13,
        color: pale,
      });
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
          width: 382,
          height: 42,
          anchor: "center",
          radius: 8,
          color: dark,
          outline: { width: 2, color: dim },
        });
        k.drawText({
          text: "←/→ ORBIT   ↑/↓ HOP",
          pos: k.vec2(320, 568),
          size: 18,
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
          width: 380,
          height: 94,
          anchor: "center",
          radius: 10,
          color: dark,
          opacity: 0.94,
          outline: { width: 2, color: ended && health > 0 ? accent : pale },
        });
        k.drawText({
          text: health > 0 ? "ORBIT HELD" : "OVERWHELMED",
          pos: k.vec2(320, 316),
          size: 24,
          color: health > 0 ? accent : paper,
          anchor: "center",
        });
        k.drawText({
          text: `${kills} KILLS · R TO RESTART`,
          pos: k.vec2(320, 351),
          size: 14,
          color: pale,
          anchor: "center",
        });
      }
    });

    playtest.ready();
  },
};

export default game;
