import type { GameObj, KAPLAYCtx } from "kaplay";
import type {
  NodeRuntimeContext,
  PlaytestApi,
  SearchForFunGame,
} from "@search-for-fun/runtime";

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Enemy {
  body: GameObj;
  hp: number;
  speed: number;
  vy: number;
  grounded: boolean;
  jumpClock: number;
  size: number;
  heavy: boolean;
}

interface Bolt {
  body: GameObj;
  vx: number;
  vy: number;
  damage: number;
  life: number;
}

interface Spark {
  body: GameObj;
  value: number;
  life: number;
}

interface Pulse {
  body: GameObj;
  life: number;
  maxLife: number;
  endScale: number;
}

const game: SearchForFunGame = {
  id: "n_0000_arcstep_horde",
  title: "Arcstep Horde",
  instructions: "Move with Arrow Keys or A/D. Jump with Space or Up. Bolts aim and fire automatically. Gather sparks and survive 96 seconds.",

  mount(k: KAPLAYCtx, playtest: PlaytestApi, runtime: NodeRuntimeContext) {
    const W = 640;
    const H = 640;
    const runLength = 96;
    const playerHalfWidth = 12;
    const playerHalfHeight = 17;
    const gravity = 1_260;
    const accent = k.rgb(255, 187, 51);
    const pale = k.rgb(235, 237, 231);
    const muted = k.rgb(141, 147, 145);
    const platforms: Platform[] = [
      { x: 0, y: 596, width: 640, height: 44 },
      { x: 42, y: 472, width: 176, height: 13 },
      { x: 410, y: 449, width: 184, height: 13 },
      { x: 228, y: 350, width: 184, height: 13 },
      { x: 28, y: 245, width: 164, height: 13 },
      { x: 458, y: 218, width: 154, height: 13 },
    ];
    const enemies: Enemy[] = [];
    const bolts: Bolt[] = [];
    const sparks: Spark[] = [];
    const pulses: Pulse[] = [];
    const orbiters: GameObj[] = [];

    let randomState = runtime.seed >>> 0;
    let started = false;
    let ended = false;
    let elapsed = 0;
    let health = 7;
    let kills = 0;
    let level = 1;
    let power = 0;
    let jumps = 0;
    let airSeconds = 0;
    let firstPowerAt = -1;
    let playerVx = 0;
    let playerVy = 0;
    let grounded = true;
    let coyote = 0.12;
    let jumpBuffer = 0;
    let invulnerable = 0;
    let shotClock = 0.18;
    let spawnClock = 0.7;
    let statusClock = 3.5;

    const random = () => {
      randomState = (randomState + 0x6d2b79f5) >>> 0;
      let value = randomState;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
    const distance = (a: GameObj, b: GameObj) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    const powerNeeded = (currentLevel: number) => 4 + currentLevel * 2;

    k.add([k.rect(W, H), k.pos(0, 0), k.color(13, 14, 15)]);
    for (let y = 105; y < 590; y += 55) {
      k.add([k.rect(W, 1), k.pos(0, y), k.color(45, 48, 48), k.opacity(0.42)]);
    }
    for (let x = 38; x < W; x += 74) {
      k.add([k.rect(1, 490), k.pos(x, 104), k.color(38, 41, 41), k.opacity(0.26)]);
    }

    for (const platform of platforms) {
      k.add([
        k.rect(platform.width, platform.height),
        k.pos(platform.x, platform.y),
        k.color(platform.y === 596 ? 62 : 74, platform.y === 596 ? 65 : 77, platform.y === 596 ? 64 : 75),
        k.outline(2, k.rgb(142, 147, 143)),
      ]);
      if (platform.y !== 596) {
        k.add([k.rect(platform.width - 12, 3), k.pos(platform.x + 6, platform.y + 4), k.color(101, 106, 103)]);
      }
    }

    k.add([k.text("ARCSTEP HORDE", { size: 22 }), k.pos(20, 17), k.color(pale)]);
    const timeText = k.add([k.text("96s", { size: 21 }), k.pos(620, 17), k.anchor("topright"), k.color(pale)]);
    const lifeText = k.add([k.text("LIFE  ◆ ◆ ◆ ◆ ◆ ◆ ◆", { size: 13 }), k.pos(20, 52), k.color(pale)]);
    const tierText = k.add([k.text("BOLTS  I", { size: 13 }), k.pos(241, 52), k.color(accent)]);
    k.add([k.rect(180, 8), k.pos(419, 57), k.anchor("left"), k.color(57, 60, 59)]);
    const powerBar = k.add([k.rect(180, 8), k.pos(419, 57), k.anchor("left"), k.color(accent), k.scale(0.02, 1)]);
    const powerText = k.add([k.text("SPARK 0/6", { size: 11 }), k.pos(419, 72), k.color(muted)]);
    const status = k.add([
      k.text("MOVE + JUMP TO BEGIN  •  AUTO-AIM IS ACTIVE", { size: 14 }),
      k.pos(W / 2, 91),
      k.anchor("center"),
      k.color(accent),
    ]);

    const playerAura = k.add([
      k.circle(28),
      k.pos(320, 575),
      k.anchor("center"),
      k.color(accent),
      k.opacity(0.07),
      k.scale(1),
    ]);
    const playerBody = k.add([
      k.rect(playerHalfWidth * 2, playerHalfHeight * 2),
      k.pos(320, 579),
      k.anchor("center"),
      k.color(pale),
      k.outline(3, k.rgb(106, 111, 109)),
    ]);
    const playerCrest = k.add([
      k.polygon([k.vec2(-9, 3), k.vec2(0, -9), k.vec2(9, 3)]),
      k.pos(playerBody.pos.x, playerBody.pos.y - 20),
      k.anchor("center"),
      k.color(accent),
    ]);
    const playerBoot = k.add([
      k.rect(26, 6),
      k.pos(playerBody.pos.x, playerBody.pos.y + 17),
      k.anchor("center"),
      k.color(98, 103, 101),
    ]);

    const begin = (control: "move" | "jump") => {
      if (started || ended) return;
      started = true;
      status.text = "EVADE THE HORDE  •  SPARKS GROW YOUR AUTO-BOLTS";
      statusClock = 3.1;
      playtest.start();
      playtest.event("first_input", { control });
    };

    const addPulse = (x: number, y: number, radius: number, opacity = 0.34, life = 0.34) => {
      const body = k.add([
        k.circle(18),
        k.pos(x, y),
        k.anchor("center"),
        k.color(accent),
        k.opacity(opacity),
        k.outline(3, k.rgb(255, 220, 143)),
        k.scale(0.15),
      ]);
      pulses.push({ body, life, maxLife: life, endScale: radius / 18 });
    };

    const queueJump = () => {
      if (ended) return;
      begin("jump");
      jumpBuffer = 0.13;
    };

    k.onButtonPress(["left", "right"], () => begin("move"));
    k.onButtonPress("up", queueJump);
    k.onButtonPress("primary", queueJump);
    k.onButtonPress("restart", () => playtest.restart());

    const dropSpark = (x: number, y: number, heavy: boolean) => {
      const body = k.add([
        heavy ? k.rect(11, 11) : k.polygon([k.vec2(0, -7), k.vec2(6, 0), k.vec2(0, 7), k.vec2(-6, 0)]),
        k.pos(x, y),
        k.anchor("center"),
        k.color(accent),
        k.outline(2, k.rgb(255, 226, 158)),
        k.rotate(heavy ? 45 : 0),
      ]);
      sparks.push({ body, value: heavy ? 2 : 1, life: 14 });
    };

    const defeatEnemy = (enemy: Enemy) => {
      const index = enemies.indexOf(enemy);
      if (index < 0) return;
      enemies.splice(index, 1);
      const x = enemy.body.pos.x;
      const y = enemy.body.pos.y;
      k.destroy(enemy.body);
      kills += 1;
      dropSpark(x, y, enemy.heavy);
      addPulse(x, y, enemy.heavy ? 23 : 14, enemy.heavy ? 0.32 : 0.2, 0.22);
    };

    const spawnEnemy = () => {
      if (enemies.length >= 72) return;
      const heavy = elapsed > 24 && random() < Math.min(0.28, elapsed / 260);
      const platform = platforms[Math.floor(random() * platforms.length)];
      const size = heavy ? 14 : 10;
      let x: number;
      let y: number;
      if (platform.y === 596) {
        x = random() < 0.5 ? 8 : W - 8;
        y = platform.y - size;
      } else {
        x = platform.x + 12 + random() * (platform.width - 24);
        y = platform.y - 38 - random() * 42;
      }
      const body = k.add([
        heavy ? k.rect(size * 1.7, size * 1.7) : k.circle(size),
        k.pos(x, y),
        k.anchor("center"),
        k.color(heavy ? 93 : 122, heavy ? 97 : 127, heavy ? 95 : 124),
        k.outline(2, k.rgb(heavy ? 191 : 174, heavy ? 196 : 180, heavy ? 191 : 176)),
        k.rotate(heavy ? 45 : 0),
      ]);
      enemies.push({
        body,
        hp: heavy ? 3 + Math.floor(elapsed / 65) : 1 + Math.floor(elapsed / 72),
        speed: (heavy ? 34 : 52 + random() * 15) + elapsed * 0.12,
        vy: 0,
        grounded: platform.y === 596,
        jumpClock: 0.3 + random() * 1.2,
        size,
        heavy,
      });
    };

    const levelUp = () => {
      level += 1;
      if (firstPowerAt < 0) firstPowerAt = elapsed;
      health = Math.min(7, health + 1);
      tierText.text = `BOLTS  ${"I".repeat(Math.min(level, 7))}`;
      status.text = level % 2 === 0
        ? `POWER ${level}  •  EXTRA AUTO-BOLT + FASTER FIRE`
        : `POWER ${level}  •  STRONGER BOLTS + WIDER AURA`;
      status.color = accent;
      statusClock = 2.6;
      const orbiter = k.add([
        k.polygon([k.vec2(0, -5), k.vec2(5, 0), k.vec2(0, 5), k.vec2(-5, 0)]),
        k.pos(playerBody.pos.x, playerBody.pos.y),
        k.anchor("center"),
        k.color(accent),
        k.outline(1, pale),
      ]);
      orbiters.push(orbiter);
      addPulse(playerBody.pos.x, playerBody.pos.y, 78 + level * 8, 0.42, 0.55);
      for (const enemy of [...enemies]) {
        if (distance(playerBody, enemy.body) < 70 + level * 8) {
          enemy.hp -= 1;
          if (enemy.hp <= 0) defeatEnemy(enemy);
        }
      }
      playtest.event("goal", {
        kind: "power_up",
        level,
        atSecond: Math.floor(elapsed),
        kills,
        jumps,
      });
    };

    const gainPower = (amount: number) => {
      power += amount;
      while (level < 7 && power >= powerNeeded(level)) {
        power -= powerNeeded(level);
        levelUp();
      }
    };

    const fireBolts = () => {
      const targets = [...enemies]
        .filter((enemy) => distance(playerBody, enemy.body) < 470)
        .sort((a, b) => distance(playerBody, a.body) - distance(playerBody, b.body));
      const boltCount = Math.min(3, 1 + Math.floor(level / 2));
      for (const target of targets.slice(0, boltCount)) {
        const dx = target.body.pos.x - playerBody.pos.x;
        const dy = target.body.pos.y - playerBody.pos.y;
        const length = Math.hypot(dx, dy) || 1;
        const body = k.add([
          k.circle(4 + Math.min(3, level * 0.4)),
          k.pos(playerBody.pos.x, playerBody.pos.y - 4),
          k.anchor("center"),
          k.color(accent),
          k.outline(2, k.rgb(255, 232, 181)),
        ]);
        bolts.push({
          body,
          vx: dx / length * 470,
          vy: dy / length * 470,
          damage: 1 + Math.floor((level - 1) / 3),
          life: 1.15,
        });
      }
    };

    const finish = (success: boolean) => {
      if (ended) return;
      ended = true;
      const summary = `POWER ${level}  •  ${kills} CLEARED  •  ${jumps} JUMPS`;
      status.text = success ? `STORM OUTRUN  •  ${summary}` : `HORDE CAUGHT YOU  •  ${summary}`;
      status.color = success ? accent : pale;
      playtest.event("round_end", {
        outcome: success ? "survived" : "defeated",
        seconds: Math.floor(elapsed),
        level,
        kills,
        jumps,
        airSeconds: Math.round(airSeconds),
        firstPowerAt: firstPowerAt < 0 ? null : Math.round(firstPowerAt),
      });
      if (success) {
        playtest.complete({
          level,
          kills,
          jumps,
          health,
          airSeconds: Math.round(airSeconds),
          firstPowerAt: firstPowerAt < 0 ? null : Math.round(firstPowerAt),
        });
      } else {
        playtest.event("death", { level, kills, jumps, atSecond: Math.floor(elapsed) });
        playtest.fail("overrun_by_horde");
      }
    };

    for (let index = 0; index < 7; index += 1) spawnEnemy();

    k.onUpdate(() => {
      const dt = Math.min(0.05, k.dt());

      for (const pulse of [...pulses]) {
        pulse.life -= dt;
        const progress = 1 - pulse.life / pulse.maxLife;
        pulse.body.scale = k.vec2(0.15 + progress * (pulse.endScale - 0.15));
        pulse.body.opacity = Math.max(0, (1 - progress) * 0.32);
        if (pulse.life <= 0) {
          pulses.splice(pulses.indexOf(pulse), 1);
          k.destroy(pulse.body);
        }
      }

      if (ended || !started) {
        playerAura.opacity = 0.06 + Math.sin(k.time() * 4) * 0.018;
        return;
      }

      elapsed += dt;
      statusClock = Math.max(0, statusClock - dt);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      invulnerable = Math.max(0, invulnerable - dt);
      coyote = grounded ? 0.12 : Math.max(0, coyote - dt);

      let move = 0;
      if (k.isButtonDown("left")) move -= 1;
      if (k.isButtonDown("right")) move += 1;
      const desiredVx = move * 205;
      const acceleration = grounded ? 1_650 : 980;
      const step = acceleration * dt;
      playerVx += clamp(desiredVx - playerVx, -step, step);
      if (move === 0 && grounded) playerVx *= Math.max(0, 1 - dt * 11);

      if (jumpBuffer > 0 && coyote > 0) {
        jumpBuffer = 0;
        coyote = 0;
        grounded = false;
        playerVy = -475;
        jumps += 1;
        addPulse(playerBody.pos.x, playerBody.pos.y + playerHalfHeight, 26, 0.2, 0.2);
        if (jumps === 10 || jumps === 25) {
          playtest.event("decision", { kind: "jump_milestone", jumps, level, atSecond: Math.floor(elapsed) });
        }
      }

      const holdingJump = k.isButtonDown("up") || k.isButtonDown("primary");
      const gravityScale = playerVy < 0 && !holdingJump ? 1.75 : 1;
      playerVy += gravity * gravityScale * dt;
      const previousBottom = playerBody.pos.y + playerHalfHeight;
      playerBody.pos.x = clamp(playerBody.pos.x + playerVx * dt, playerHalfWidth + 3, W - playerHalfWidth - 3);
      playerBody.pos.y += playerVy * dt;
      grounded = false;
      if (playerVy >= 0) {
        for (const platform of platforms) {
          const bottom = playerBody.pos.y + playerHalfHeight;
          const overlapsX = playerBody.pos.x + playerHalfWidth > platform.x && playerBody.pos.x - playerHalfWidth < platform.x + platform.width;
          if (overlapsX && previousBottom <= platform.y + 2 && bottom >= platform.y) {
            playerBody.pos.y = platform.y - playerHalfHeight;
            playerVy = 0;
            grounded = true;
            break;
          }
        }
      }
      if (!grounded) airSeconds += dt;
      if (playerBody.pos.y > H + 30) {
        health = 0;
        finish(false);
      }

      playerCrest.pos.x = playerBody.pos.x;
      playerCrest.pos.y = playerBody.pos.y - 20;
      playerBoot.pos.x = playerBody.pos.x + Math.sign(playerVx) * 2;
      playerBoot.pos.y = playerBody.pos.y + 17;
      playerAura.pos.x = playerBody.pos.x;
      playerAura.pos.y = playerBody.pos.y;
      const auraScale = 1 + (level - 1) * 0.13 + Math.sin(elapsed * 5) * 0.035;
      playerAura.scale = k.vec2(auraScale);
      playerAura.opacity = 0.06 + level * 0.008;
      orbiters.forEach((orbiter, index) => {
        const angle = elapsed * (2 + level * 0.06) + index * Math.PI * 2 / Math.max(1, orbiters.length);
        const radius = 27 + level * 2;
        orbiter.pos.x = playerBody.pos.x + Math.cos(angle) * radius;
        orbiter.pos.y = playerBody.pos.y + Math.sin(angle) * radius;
        orbiter.angle += 100 * dt;
      });

      spawnClock -= dt;
      if (spawnClock <= 0 && enemies.length < 72) {
        spawnEnemy();
        if (elapsed > 34 && random() < 0.28) spawnEnemy();
        if (elapsed > 68 && random() < 0.22) spawnEnemy();
        spawnClock = Math.max(0.30, 1.02 - elapsed * 0.0073) * (0.82 + random() * 0.34);
      }

      shotClock -= dt;
      if (shotClock <= 0) {
        fireBolts();
        shotClock = Math.max(0.27, 0.82 - (level - 1) * 0.085);
      }

      for (const enemy of [...enemies]) {
        enemy.jumpClock -= dt;
        const previousEnemyBottom = enemy.body.pos.y + enemy.size;
        const xDirection = Math.sign(playerBody.pos.x - enemy.body.pos.x);
        enemy.body.pos.x = clamp(enemy.body.pos.x + xDirection * enemy.speed * dt, enemy.size, W - enemy.size);
        if (enemy.grounded && playerBody.pos.y < enemy.body.pos.y - 42 && enemy.jumpClock <= 0) {
          enemy.vy = -(heavyJump(enemy) + random() * 55);
          enemy.grounded = false;
          enemy.jumpClock = 1.7 + random() * 1.4;
        }
        enemy.vy += gravity * 0.82 * dt;
        enemy.body.pos.y += enemy.vy * dt;
        enemy.grounded = false;
        if (enemy.vy >= 0) {
          for (const platform of platforms) {
            const enemyBottom = enemy.body.pos.y + enemy.size;
            const overlapsX = enemy.body.pos.x + enemy.size > platform.x && enemy.body.pos.x - enemy.size < platform.x + platform.width;
            if (overlapsX && previousEnemyBottom <= platform.y + 2 && enemyBottom >= platform.y) {
              enemy.body.pos.y = platform.y - enemy.size;
              enemy.vy = 0;
              enemy.grounded = true;
              break;
            }
          }
        }
        if (enemy.body.pos.y > H + 50) {
          enemies.splice(enemies.indexOf(enemy), 1);
          k.destroy(enemy.body);
          continue;
        }
        const touchDistance = enemy.size + 15;
        if (distance(playerBody, enemy.body) < touchDistance && invulnerable <= 0) {
          health -= 1;
          invulnerable = 1.25;
          playerVx = -xDirection * 240;
          playerVy = -240;
          grounded = false;
          playerBody.color = accent;
          addPulse(playerBody.pos.x, playerBody.pos.y, 34, 0.3, 0.25);
          playtest.event("damage", {
            health,
            source: enemy.heavy ? "heavy" : "swarm",
            atSecond: Math.floor(elapsed),
          });
          if (health <= 0) finish(false);
        }
      }

      for (const bolt of [...bolts]) {
        bolt.life -= dt;
        bolt.body.pos.x += bolt.vx * dt;
        bolt.body.pos.y += bolt.vy * dt;
        let hit = false;
        for (const enemy of [...enemies]) {
          if (distance(bolt.body, enemy.body) < enemy.size + 7) {
            enemy.hp -= bolt.damage;
            if (enemy.hp <= 0) defeatEnemy(enemy);
            hit = true;
            break;
          }
        }
        if (hit || bolt.life <= 0 || bolt.body.pos.x < -20 || bolt.body.pos.x > W + 20 || bolt.body.pos.y < 85 || bolt.body.pos.y > H + 20) {
          bolts.splice(bolts.indexOf(bolt), 1);
          k.destroy(bolt.body);
        }
      }

      for (const spark of [...sparks]) {
        spark.life -= dt;
        spark.body.angle += 120 * dt;
        const sparkDistance = distance(playerBody, spark.body);
        if (sparkDistance < 112) {
          const dx = playerBody.pos.x - spark.body.pos.x;
          const dy = playerBody.pos.y - spark.body.pos.y;
          const length = Math.hypot(dx, dy) || 1;
          const pull = 185 + level * 24;
          spark.body.pos.x += dx / length * pull * dt;
          spark.body.pos.y += dy / length * pull * dt;
        }
        if (sparkDistance < 20) {
          sparks.splice(sparks.indexOf(spark), 1);
          k.destroy(spark.body);
          gainPower(spark.value);
        } else if (spark.life <= 0) {
          sparks.splice(sparks.indexOf(spark), 1);
          k.destroy(spark.body);
        }
      }

      if (invulnerable < 0.9) playerBody.color = pale;
      const lifePips = "◆ ".repeat(Math.max(0, health)).trim();
      lifeText.text = `LIFE  ${lifePips || "—"}`;
      const needed = powerNeeded(level);
      powerBar.scale = k.vec2(level >= 7 ? 1 : Math.max(0.02, power / needed), 1);
      powerText.text = level >= 7 ? "SPARK MAX" : `SPARK ${power}/${needed}`;
      timeText.text = `${Math.max(0, Math.ceil(runLength - elapsed))}s`;
      if (statusClock <= 0) {
        status.text = level >= 7 ? "MAX POWER  •  KEEP BOUNDING" : "JUMP THE CROWD  •  AUTO-BOLTS TAKE THE NEAREST TARGET";
        status.color = level >= 7 ? accent : muted;
      }

      if (elapsed >= runLength) finish(true);
    });

    function heavyJump(enemy: Enemy) {
      return enemy.heavy ? 350 : 390;
    }

    playtest.ready();
    return () => {
      enemies.length = 0;
      bolts.length = 0;
      sparks.length = 0;
      pulses.length = 0;
      orbiters.length = 0;
    };
  },
};

export default game;
