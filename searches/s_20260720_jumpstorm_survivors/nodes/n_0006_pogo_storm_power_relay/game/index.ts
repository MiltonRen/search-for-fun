import type { GameObj, KAPLAYCtx } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

type ThreatKind = "skitter" | "hover" | "charger";
type ChargerState = "telegraph" | "active";
type PowerKind = "capacitor" | "lancer" | "phase";

interface Foe {
  actor: GameObj;
  visual: GameObj;
  cue?: GameObj;
  kind: ThreatKind;
  x: number;
  y: number;
  baseY: number;
  speed: number;
  size: number;
  heavy: boolean;
  phase: number;
  direction: number;
  chargerState: ChargerState;
  stateClock: number;
}

interface Pickup {
  actor: GameObj;
  kind: PowerKind;
  x: number;
  y: number;
  phase: number;
}

interface Ring {
  body: GameObj;
  life: number;
  maxLife: number;
  endScale: number;
}

interface Spark {
  body: GameObj;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const game: SearchForFunGame = {
  id: "n_0006_pogo_storm_power_relay",
  title: "Pogo Storm: Power Relay",
  instructions: "Keyboard: Left / Right steer in air. Space stomps. Catch all three gold relays. R restarts.",

  mount(k: KAPLAYCtx, playtest, runtime) {
    const W = 640;
    const H = 640;
    const runLength = 84;
    const arena = { left: 28, right: 612, top: 112, floor: 572 };
    const heroGroundY = arena.floor - 19;
    const accent = k.rgb(255, 199, 64);
    const pale = k.rgb(235, 236, 230);
    const mid = k.rgb(153, 157, 154);
    const dark = k.rgb(18, 19, 19);
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
    const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

    let randomState = runtime.seed >>> 0;
    const random = () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    };

    const playerState = { x: 320, y: heroGroundY, vx: 0, vy: 0 };
    let started = false;
    let ended = false;
    let elapsed = 0;
    let grounded = true;
    let stompArmed = false;
    let stompAge = 0;
    let stompCooldown = 0;
    let invulnerable = 0;
    let health = 5;
    let kills = 0;
    let landings = 0;
    let cleanLandings = 0;
    let cleanStreak = 0;
    let bestStreak = 0;
    let bestCascade = 0;
    let recentChain = 0;
    let chainClock = 0;
    let shake = 0;
    let bannerClock = 4;
    let bannerMessage = "PRESS A DIRECTION  •  BEGIN THE BOUNCE";
    let waveClock = 5.4;
    let waveIndex = 0;
    let currentPattern: ThreatKind = "skitter";
    let nextPowerIndex = 0;
    let nextPowerTime = 1.4;
    let lancerClock = 0;
    let phaseCharges = 0;
    const acquired = new Set<PowerKind>();
    const triggered = new Set<PowerKind>();

    k.add([k.rect(W, H), k.pos(0, 0), k.color(dark)]);
    k.add([
      k.rect(arena.right - arena.left, arena.floor - arena.top),
      k.pos(arena.left, arena.top),
      k.color(29, 31, 30),
      k.outline(3, k.rgb(103, 106, 103)),
    ]);
    for (let x = 58; x < arena.right; x += 46) {
      k.add([k.rect(1, arena.floor - arena.top), k.pos(x, arena.top), k.color(49, 51, 50), k.opacity(0.56)]);
    }
    for (let y = 158; y < arena.floor; y += 46) {
      k.add([k.rect(arena.right - arena.left, 1), k.pos(arena.left, y), k.color(49, 51, 50), k.opacity(0.56)]);
    }
    k.add([k.rect(arena.right - arena.left, 7), k.pos(arena.left, arena.floor), k.color(mid)]);

    const titleText = k.add([k.text("POGO STORM  •  POWER RELAY", { size: 21 }), k.pos(24, 18), k.color(pale)]);
    const timerText = k.add([k.text(`${runLength}s`, { size: 24 }), k.pos(568, 20), k.color(accent)]);
    const statsText = k.add([k.text("HEALTH  5    POWERS  0/3    CLEARED  0", { size: 16 }), k.pos(25, 59), k.color(mid)]);
    const powerText = k.add([k.text("CAPACITOR   LANCER   PHASE", { size: 12 }), k.pos(391, 88), k.color(mid)]);
    const patternText = k.add([k.text("GROUND SKITTERS", { size: 12 }), k.pos(25, 88), k.color(accent)]);
    const bannerText = k.add([k.text(bannerMessage, { size: 14 }), k.pos(320, 622), k.anchor("center"), k.color(accent)]);

    const player = k.add([k.pos(playerState.x, playerState.y), "player"]);
    const heroGlow = player.add([
      k.circle(24), k.pos(0, 0), k.anchor("center"), k.color(accent), k.opacity(0.16), k.scale(1),
    ]);
    player.add([k.circle(13), k.pos(0, 0), k.anchor("center"), k.color(pale), k.outline(4, accent)]);
    const spring = player.add([k.rect(5, 18), k.pos(0, 13), k.anchor("top"), k.color(mid), k.scale(1)]);
    const boot = player.add([k.rect(25, 7), k.pos(0, 31), k.anchor("center"), k.color(accent)]);
    const landingGuide = player.add([k.rect(48, 3), k.pos(-24, 25), k.color(accent), k.opacity(0.25)]);
    const shield = player.add([
      k.circle(30), k.pos(0, 0), k.anchor("center"), k.color(accent), k.opacity(0), k.outline(3, accent), k.scale(1), k.z(-2),
    ]);
    const lanceEmitter = player.add([
      k.rect(18, 4), k.pos(13, -5), k.anchor("left"), k.color(accent), k.opacity(0),
    ]);

    const foes: Foe[] = [];
    const pickups: Pickup[] = [];
    const rings: Ring[] = [];
    const sparks: Spark[] = [];
    const powerOrder: PowerKind[] = ["capacitor", "lancer", "phase"];

    const ring = (x: number, y: number, radius: number, bright = true) => {
      const body = k.add([
        k.circle(12), k.pos(x, y), k.anchor("center"),
        k.color(bright ? accent : pale), k.opacity(bright ? 0.68 : 0.32),
        k.outline(bright ? 4 : 2, bright ? accent : pale), k.scale(0.2),
      ]);
      rings.push({ body, life: 0.34, maxLife: 0.34, endScale: radius / 12 });
    };

    const burst = (x: number, y: number, amount: number, bright = true) => {
      for (let index = 0; index < amount; index += 1) {
        const angle = random() * Math.PI * 2;
        const speed = 60 + random() * 170;
        const life = 0.2 + random() * 0.28;
        const body = k.add([
          k.rect(index % 3 === 0 ? 5 : 3, 3), k.pos(x, y), k.anchor("center"),
          k.color(bright && index % 3 === 0 ? accent : pale), k.opacity(0.92),
        ]);
        sparks.push({ body, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life });
      }
    };

    const patternLabel = (kind: ThreatKind) => kind === "skitter" ? "GROUND SKITTERS" : kind === "hover" ? "HOVER WEAVE" : "CHARGE LINE";
    const powerLabel = (kind: PowerKind) => kind === "capacitor" ? "CAPACITOR" : kind === "lancer" ? "LANCER" : "PHASE GUARD";

    const begin = (method: string) => {
      if (started || ended) return;
      started = true;
      grounded = false;
      playerState.vy = -480;
      playerState.vx = method === "left" ? -90 : method === "right" ? 90 : 0;
      player.pos = k.vec2(playerState.x, playerState.y);
      playtest.start();
      playtest.event("first_input", { method });
      playtest.event("decision", { kind: "encounter_pattern", pattern: "skitter", second: 0 });
      bannerMessage = "SKITTER RUSH  •  FIRST RELAY INBOUND";
      bannerClock = 2.2;
      ring(playerState.x, arena.floor - 4, 46, false);
    };

    const removeFoe = (foe: Foe) => {
      const index = foes.indexOf(foe);
      if (index < 0) return false;
      foes.splice(index, 1);
      k.destroy(foe.actor);
      return true;
    };

    const eliminate = (foe: Foe, source: "landing" | "capacitor" | "lancer" | "phase") => {
      const { x, y } = foe;
      if (!removeFoe(foe)) return 0;
      kills += 1;
      burst(x, y, foe.heavy ? 7 : 4, source !== "phase");
      return 1;
    };

    const powerTrigger = (kind: PowerKind, effect: string) => {
      if (triggered.has(kind)) return;
      triggered.add(kind);
      playtest.event("power_trigger", { power: kind, effect, second: Math.floor(elapsed) });
    };

    const nearestFoe = () => foes.reduce<Foe | undefined>((best, foe) => {
      if (!best) return foe;
      return distance(foe.x, foe.y, playerState.x, playerState.y) < distance(best.x, best.y, playerState.x, playerState.y) ? foe : best;
    }, undefined);

    const collectPower = (pickup: Pickup) => {
      const index = pickups.indexOf(pickup);
      if (index >= 0) pickups.splice(index, 1);
      k.destroy(pickup.actor);
      const kind = pickup.kind;
      acquired.add(kind);
      ring(playerState.x, playerState.y, kind === "capacitor" ? 90 : kind === "lancer" ? 62 : 76, true);
      burst(playerState.x, playerState.y, 18, true);
      playtest.event("power_acquired", { power: kind, count: acquired.size, second: Math.floor(elapsed) });
      if (kind === "capacitor") {
        bannerMessage = "CAPACITOR  •  LANDINGS HIT WIDER";
        powerTrigger(kind, "wide_landing_wave_armed");
      } else if (kind === "lancer") {
        bannerMessage = "LANCER  •  AUTO-STRIKES THE NEAREST THREAT";
        lancerClock = 0;
        lanceEmitter.opacity = 0.92;
        const target = nearestFoe();
        if (target) {
          ring(target.x, target.y, 26, true);
          eliminate(target, "lancer");
        }
        powerTrigger(kind, "first_auto_strike");
      } else {
        bannerMessage = "PHASE GUARD  •  NEXT CONTACT BECOMES A CRUSH";
        phaseCharges = 1;
        shield.opacity = 0.55;
        powerTrigger(kind, "contact_guard_armed");
      }
      bannerClock = 2.2;
    };

    const spawnPower = (kind: PowerKind) => {
      const side = nextPowerIndex % 2 === 0 ? 1 : -1;
      const x = clamp(playerState.x + side * 190, arena.left + 45, arena.right - 45);
      const y = arena.top + 58 + nextPowerIndex * 34;
      const actor = k.add([k.pos(x, y), `power-${kind}`]);
      actor.add([
        kind === "capacitor" ? k.circle(16) : k.rect(kind === "lancer" ? 34 : 29, kind === "lancer" ? 9 : 29),
        k.pos(0, 0), k.anchor("center"), k.color(accent), k.outline(3, pale),
        ...(kind === "phase" ? [k.rotate(45)] : []),
      ]);
      actor.add([k.text(powerLabel(kind), { size: 11 }), k.pos(0, -29), k.anchor("center"), k.color(accent)]);
      pickups.push({ actor, kind, x, y, phase: random() * Math.PI * 2 });
      bannerMessage = `${powerLabel(kind)} RELAY  •  HOMING TO YOU`;
      bannerClock = 1.45;
    };

    const spawnFoe = (kind: ThreatKind, side?: "left" | "right", lane = 0) => {
      if (foes.length >= 88) return;
      const fromLeft = side ? side === "left" : random() < 0.5;
      const heavy = kind === "skitter" && elapsed > 28 && random() < Math.min(0.24, elapsed * 0.0025);
      const size = kind === "charger" ? 14 : heavy ? 13 : kind === "hover" ? 10 : 7 + random() * 3;
      const x = fromLeft ? arena.left + size + 4 : arena.right - size - 4;
      const baseY = kind === "hover" ? heroGroundY - 82 - lane * 62 : arena.floor - size - 2;
      const y = baseY;
      const actor = k.add([k.pos(x, y), `threat-${kind}`]);
      let visual: GameObj;
      let cue: GameObj | undefined;
      if (kind === "hover") {
        visual = actor.add([k.polygon([k.vec2(-13, 0), k.vec2(0, -9), k.vec2(13, 0), k.vec2(0, 9)]), k.pos(0, 0), k.anchor("center"), k.color(145, 149, 147), k.outline(2, pale)]);
        actor.add([k.rect(26, 2), k.pos(0, 0), k.anchor("center"), k.color(pale), k.opacity(0.6)]);
      } else if (kind === "charger") {
        visual = actor.add([k.rect(25, 18), k.pos(0, 0), k.anchor("center"), k.color(103, 107, 105), k.outline(3, pale), k.rotate(45)]);
        cue = actor.add([
          k.rect(arena.right - arena.left - 16, 2),
          k.pos(fromLeft ? 8 : -(arena.right - arena.left - 8), 0),
          k.color(accent), k.opacity(0.78),
        ]);
      } else {
        visual = actor.add([
          heavy ? k.rect(size * 1.55, size * 1.55) : k.circle(size), k.pos(0, 0), k.anchor("center"),
          k.color(heavy ? 112 : 150, heavy ? 115 : 153, heavy ? 113 : 151), k.outline(heavy ? 2 : 1, pale),
        ]);
        actor.add([k.rect(size + 6, 3), k.pos(fromLeft ? -size : size, 4), k.anchor("center"), k.color(mid)]);
      }
      foes.push({
        actor, visual, cue, kind, x, y, baseY,
        speed: kind === "charger" ? 355 : kind === "hover" ? 112 + random() * 18 : (heavy ? 18 : 44) + random() * 12 + elapsed * 0.06,
        size, heavy, phase: random() * Math.PI * 2, direction: fromLeft ? 1 : -1,
        chargerState: "telegraph", stateClock: kind === "charger" ? 0.95 : 0,
      });
    };

    const spawnPattern = (kind: ThreatKind) => {
      currentPattern = kind;
      patternText.text = patternLabel(kind);
      patternText.color = kind === "charger" ? accent : pale;
      if (kind === "skitter") {
        for (let index = 0; index < 6; index += 1) spawnFoe("skitter", index % 2 === 0 ? "left" : "right");
        bannerMessage = "SKITTER RUSH  •  PICK A LANDING CLUSTER";
      } else if (kind === "hover") {
        spawnFoe("hover", "left", 0);
        spawnFoe("hover", "right", 0);
        spawnFoe("hover", "left", 1);
        spawnFoe("skitter", "right");
        spawnFoe("skitter", "left");
        bannerMessage = "HOVER WEAVE  •  STEER AROUND THE HIGH LANE";
      } else {
        spawnFoe("charger", random() < 0.5 ? "left" : "right");
        spawnFoe("skitter", "left");
        spawnFoe("skitter", "right");
        spawnFoe("skitter", random() < 0.5 ? "left" : "right");
        bannerMessage = "CHARGE LINE  •  STAY AIRBORNE THROUGH THE SWEEP";
      }
      bannerClock = 2.1;
      playtest.event("decision", { kind: "encounter_pattern", pattern: kind, second: Math.floor(elapsed) });
    };

    const hurt = (source: "contact" | "rough_landing", contact?: Foe) => {
      if (invulnerable > 0 || ended) return;
      if (source === "contact" && phaseCharges > 0) {
        phaseCharges -= 1;
        shield.opacity = 0.08;
        invulnerable = 0.38;
        shake = 5;
        if (contact) eliminate(contact, "phase");
        ring(playerState.x, playerState.y, 72, true);
        burst(playerState.x, playerState.y, 14, true);
        bannerMessage = "PHASE CRUSH  •  CONTACT CONVERTED";
        bannerClock = 1.4;
        return;
      }
      health -= 1;
      invulnerable = 1.15;
      cleanStreak = 0;
      shake = 7;
      bannerMessage = source === "rough_landing" ? "LATE LANDING  •  FIND THE BEAT" : "SWARM CONTACT  •  STOMP CLEARER";
      bannerClock = 1.5;
      ring(playerState.x, playerState.y, 36, false);
      playtest.event("damage", { source, health, powers: acquired.size, second: Math.floor(elapsed), pattern: currentPattern });
      if (health > 0) return;
      ended = true;
      titleText.text = "THE STORM BROKE THE BOUNCE";
      bannerText.text = `3 RELAYS BY 16s  •  ${kills} CLEARED  •  R RESTARTS`;
      bannerText.color = accent;
      playtest.event("death", { source, cleared: kills, powers_acquired: [...acquired], powers_triggered: [...triggered] });
      playtest.event("round_end", { outcome: "overrun", cleared: kills, powers: acquired.size, best_streak: bestStreak });
      playtest.fail("swarm_broke_the_bounce");
    };

    const land = () => {
      const wasStomp = stompArmed && stompAge <= 0.9;
      const powered = acquired.has("capacitor");
      const pulseRadius = wasStomp ? (powered ? 104 : 68) : (powered ? 55 : 34);
      const before = kills;
      ring(playerState.x, arena.floor - 3, pulseRadius, wasStomp || powered);
      burst(playerState.x, arena.floor - 8, wasStomp ? 18 : 8, wasStomp || powered);
      for (const foe of [...foes]) {
        if (distance(foe.x, foe.y, playerState.x, heroGroundY) < pulseRadius + foe.size) eliminate(foe, powered ? "capacitor" : "landing");
      }
      const landingKills = kills - before;
      bestCascade = Math.max(bestCascade, landingKills);
      recentChain = landingKills;
      chainClock = 1.25;
      landings += 1;
      const clean = wasStomp && landingKills > 0;
      if (clean) {
        cleanLandings += 1;
        cleanStreak += 1;
        bestStreak = Math.max(bestStreak, cleanStreak);
        bannerMessage = landingKills >= 8 ? `LANDING CASCADE  ×${landingKills}` : `CLEAN STOMP  ×${landingKills}`;
        bannerClock = 1.05;
        if (cleanLandings === 1) playtest.event("goal", { kind: "rhythm_found", cleared: landingKills, second: Math.floor(elapsed) });
      } else {
        cleanStreak = 0;
        if (wasStomp) {
          bannerMessage = "STOMPED EMPTY  •  STEER TOWARD THE SWARM";
          bannerClock = 0.9;
        }
      }
      const danger = foes.some((foe) => distance(foe.x, foe.y, playerState.x, heroGroundY) < 48 + foe.size);
      if (!wasStomp && danger) hurt("rough_landing");
      playerState.y = heroGroundY;
      playerState.vy = -468;
      playerState.vx *= 0.76;
      grounded = false;
      stompArmed = false;
      stompAge = 0;
    };

    const stomp = () => {
      if (ended) return;
      begin("primary");
      if (grounded || stompCooldown > 0 || playerState.y > heroGroundY - 34) {
        bannerMessage = "TOO LOW  •  STOMP EARLIER";
        bannerClock = 0.7;
        return;
      }
      stompArmed = true;
      stompAge = 0;
      stompCooldown = 0.24;
      playerState.vy = Math.max(660, playerState.vy + 410);
      ring(playerState.x, playerState.y, 25, true);
      playtest.event("decision", { kind: "stomp", height: Math.round(heroGroundY - playerState.y), powers: acquired.size, second: Math.floor(elapsed) });
    };

    const directionPresses = (["left", "right"] as const).map((action) => k.onButtonPress(action, () => begin(action)));
    const stompPress = k.onButtonPress("primary", stomp);
    const restartPress = k.onButtonPress("restart", () => playtest.restart());

    for (let index = 0; index < 8; index += 1) spawnFoe("skitter", index % 2 === 0 ? "left" : "right");

    const update = k.onUpdate(() => {
      if (ended) return;
      const dt = Math.min(0.05, k.dt());
      invulnerable = Math.max(0, invulnerable - dt);
      stompCooldown = Math.max(0, stompCooldown - dt);
      bannerClock = Math.max(0, bannerClock - dt);
      chainClock = Math.max(0, chainClock - dt);
      shake = Math.max(0, shake - dt * 17);
      if (stompArmed) stompAge += dt;

      if (!started) {
        const idle = 1 + Math.sin(k.time() * 4) * 0.07;
        heroGlow.scale = k.vec2(idle);
        return;
      }

      elapsed += dt;
      waveClock -= dt;
      if (waveClock <= 0) {
        waveIndex += 1;
        const patterns: ThreatKind[] = ["skitter", "hover", "charger"];
        spawnPattern(patterns[waveIndex % patterns.length]);
        waveClock = 5.4;
      }
      if (nextPowerIndex < powerOrder.length && elapsed >= nextPowerTime) {
        spawnPower(powerOrder[nextPowerIndex]);
        nextPowerIndex += 1;
        nextPowerTime += 4.6;
      }

      const steer = Number(k.isButtonDown("right")) - Number(k.isButtonDown("left"));
      if (!grounded) {
        playerState.vx += steer * (stompArmed ? 430 : 610) * dt;
        playerState.vx *= Math.pow(0.82, dt);
        playerState.vx = clamp(playerState.vx, -245, 245);
        playerState.vy += 1120 * dt;
        playerState.x += playerState.vx * dt;
        playerState.y += playerState.vy * dt;
        if (playerState.x <= arena.left + 17 || playerState.x >= arena.right - 17) {
          playerState.x = clamp(playerState.x, arena.left + 17, arena.right - 17);
          playerState.vx *= -0.58;
          ring(playerState.x, playerState.y, 20, false);
        }
        if (playerState.y >= heroGroundY && playerState.vy > 0) land();
      }
      player.pos = k.vec2(playerState.x, playerState.y);

      const height = clamp((heroGroundY - playerState.y) / 210, 0, 1);
      landingGuide.opacity = stompArmed ? 0.72 : 0.18 + height * 0.14;
      heroGlow.opacity = invulnerable > 0 ? 0.42 + Math.sin(elapsed * 25) * 0.28 : 0.13 + (stompArmed ? 0.28 : 0);
      const glowScale = 1 + Math.sin(elapsed * 9) * 0.05 + acquired.size * 0.06;
      heroGlow.scale = k.vec2(glowScale);
      spring.scale = k.vec2(1, stompArmed ? 1.35 : clamp(0.72 + Math.abs(playerState.vy) / 1000, 0.72, 1.25));
      boot.pos = k.vec2(clamp(playerState.vx / 55, -7, 7), 31);
      shield.scale = k.vec2(1 + Math.sin(elapsed * 7) * 0.08);

      if (acquired.has("lancer")) {
        lancerClock -= dt;
        if (lancerClock <= 0) {
          lancerClock = 1.15;
          const target = nearestFoe();
          if (target) {
            ring(target.x, target.y, 24, true);
            burst(target.x, target.y, 5, true);
            eliminate(target, "lancer");
          }
        }
      }

      for (const pickup of [...pickups]) {
        pickup.phase += dt * 7;
        const dx = playerState.x - pickup.x;
        const dy = playerState.y - pickup.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const speed = 390 + Math.sin(pickup.phase) * 35;
        pickup.x += dx / length * speed * dt;
        pickup.y += dy / length * speed * dt;
        pickup.actor.pos = k.vec2(pickup.x, pickup.y);
        pickup.actor.scale = k.vec2(1 + Math.sin(pickup.phase) * 0.09);
        if (length < 30) collectPower(pickup);
      }

      for (const foe of [...foes]) {
        foe.phase += dt * (foe.kind === "hover" ? 3.4 : 5.2);
        if (foe.kind === "skitter") {
          foe.direction = Math.sign(playerState.x - foe.x) || foe.direction;
          foe.x = clamp(foe.x + foe.direction * foe.speed * dt, arena.left + foe.size, arena.right - foe.size);
          foe.y = foe.baseY + Math.sin(foe.phase) * 1.5;
        } else if (foe.kind === "hover") {
          foe.x += foe.direction * foe.speed * dt;
          if (foe.x <= arena.left + foe.size || foe.x >= arena.right - foe.size) {
            foe.x = clamp(foe.x, arena.left + foe.size, arena.right - foe.size);
            foe.direction *= -1;
          }
          foe.y = foe.baseY + Math.sin(foe.phase) * 18;
          foe.visual.angle = Math.sin(foe.phase) * 11;
        } else if (foe.chargerState === "telegraph") {
          foe.stateClock -= dt;
          if (foe.cue) foe.cue.opacity = 0.35 + Math.sin(elapsed * 20) * 0.3;
          foe.visual.scale = k.vec2(1 + Math.sin(elapsed * 20) * 0.08);
          if (foe.stateClock <= 0) {
            foe.chargerState = "active";
            if (foe.cue) foe.cue.opacity = 0.08;
            ring(foe.x, foe.y, 30, false);
          }
        } else {
          foe.x += foe.direction * foe.speed * dt;
          foe.visual.scale = k.vec2(1);
          if (foe.x < arena.left - 32 || foe.x > arena.right + 32) {
            removeFoe(foe);
            continue;
          }
        }
        foe.actor.pos = k.vec2(foe.x, foe.y);
        if (distance(foe.x, foe.y, playerState.x, playerState.y) < foe.size + 14) hurt("contact", foe);
      }

      for (const effect of [...rings]) {
        effect.life -= dt;
        const progress = 1 - effect.life / effect.maxLife;
        const scale = 0.2 + (effect.endScale - 0.2) * progress;
        effect.body.scale = k.vec2(scale);
        effect.body.opacity = Math.max(0, 0.65 * (1 - progress));
        if (effect.life <= 0) {
          rings.splice(rings.indexOf(effect), 1);
          k.destroy(effect.body);
        }
      }
      for (const spark of [...sparks]) {
        spark.life -= dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 280 * dt;
        spark.body.pos = k.vec2(spark.x, spark.y);
        spark.body.opacity = Math.max(0, spark.life / spark.maxLife);
        if (spark.life <= 0) {
          sparks.splice(sparks.indexOf(spark), 1);
          k.destroy(spark.body);
        }
      }

      timerText.text = `${Math.max(0, Math.ceil(runLength - elapsed))}s`;
      statsText.text = `HEALTH  ${health}    POWERS  ${acquired.size}/3    CLEARED  ${kills}`;
      powerText.text = `${acquired.has("capacitor") ? "◆ CAP" : "◇ CAP"}   ${acquired.has("lancer") ? "◆ LANCE" : "◇ LANCE"}   ${acquired.has("phase") ? "◆ PHASE" : "◇ PHASE"}`;
      powerText.color = acquired.size > 0 ? accent : mid;
      const chainLabel = chainClock > 0 && recentChain > 1 ? `CASCADE ×${recentChain}` : stompArmed ? "STOMP ARMED" : "STEER INTO A CLUSTER  •  SPACE";
      bannerText.text = bannerClock > 0 ? bannerMessage : chainLabel;
      bannerText.color = stompArmed || bannerClock > 0 ? accent : mid;
      k.camPos(k.vec2(W / 2 + Math.sin(elapsed * 41) * shake * 0.42, H / 2 + Math.cos(elapsed * 37) * shake * 0.3));

      if (elapsed >= runLength) {
        ended = true;
        titleText.text = "THE HERO BECAME THE STORM";
        bannerText.text = `${kills} CLEARED  •  ALL THREE RELAYS TESTED  •  BEST RHYTHM ${bestStreak}`;
        bannerText.color = accent;
        k.camPos(k.vec2(W / 2, H / 2));
        playtest.event("goal", { kind: "survived", cleared: kills, powers_acquired: [...acquired], powers_triggered: [...triggered] });
        playtest.event("round_end", { outcome: "survived", cleared: kills, powers: acquired.size, clean_landings: cleanLandings });
        playtest.complete({
          cleared: kills,
          powers_acquired: [...acquired],
          powers_triggered: [...triggered],
          clean_landings: cleanLandings,
          best_streak: bestStreak,
          best_cascade: bestCascade,
          health,
          patterns: 3,
        });
      }
    });

    playtest.ready();
    return () => {
      for (const handle of directionPresses) handle.cancel();
      stompPress.cancel();
      restartPress.cancel();
      update.cancel();
      k.camPos(k.vec2(W / 2, H / 2));
    };
  },
};

export default game;
