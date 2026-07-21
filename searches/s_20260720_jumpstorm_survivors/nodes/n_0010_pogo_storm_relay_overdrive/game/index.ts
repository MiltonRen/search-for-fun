import type { GameObj, KAPLAYCtx } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

type ThreatKind = "skitter" | "hover" | "charger";
type ChargerState = "telegraph" | "active";
type PowerKind = "capacitor" | "lancer" | "phase";
type EliminationSource = "landing" | "capacitor" | "lancer" | "phase";

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

interface Beam {
  body: GameObj;
  life: number;
  maxLife: number;
}

interface Echo {
  x: number;
  y: number;
  delay: number;
  radius: number;
}

const game: SearchForFunGame = {
  id: "n_0010_pogo_storm_relay_overdrive",
  title: "Pogo Storm: Relay Overdrive",
  instructions: "Keyboard: Left / Right steer. Space stomps. Powers ignite automatically. R restarts.",

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
    let lancerClock = 0;
    let phaseCharges = 0;
    let phaseRechargeClock = 0;
    const unlocked = new Set<PowerKind>();
    const triggered = new Set<PowerKind>();

    k.add([k.rect(W, H), k.pos(0, 0), k.color(dark), k.z(-50)]);
    k.add([
      k.rect(arena.right - arena.left, arena.floor - arena.top),
      k.pos(arena.left, arena.top),
      k.color(29, 31, 30),
      k.outline(3, k.rgb(103, 106, 103)),
      k.z(-40),
    ]);
    for (let x = 58; x < arena.right; x += 46) {
      k.add([k.rect(1, arena.floor - arena.top), k.pos(x, arena.top), k.color(49, 51, 50), k.opacity(0.56), k.z(-39)]);
    }
    for (let y = 158; y < arena.floor; y += 46) {
      k.add([k.rect(arena.right - arena.left, 1), k.pos(arena.left, y), k.color(49, 51, 50), k.opacity(0.56), k.z(-39)]);
    }
    k.add([k.rect(arena.right - arena.left, 7), k.pos(arena.left, arena.floor), k.color(mid), k.z(-35)]);

    const titleText = k.add([k.text("POGO STORM  •  RELAY OVERDRIVE", { size: 20 }), k.pos(24, 18), k.color(pale), k.z(50)]);
    const timerText = k.add([k.text(`${runLength}s`, { size: 24 }), k.pos(568, 20), k.color(accent), k.z(50)]);
    const statsText = k.add([k.text("HEALTH  5    OVERDRIVE  0/3    CLEARED  0", { size: 16 }), k.pos(25, 59), k.color(mid), k.z(50)]);
    const powerText = k.add([k.text("◇ CAP   ◇ LANCE   ◇ PHASE", { size: 12 }), k.pos(398, 88), k.color(mid), k.z(50)]);
    const patternText = k.add([k.text("GROUND SKITTERS", { size: 12 }), k.pos(25, 88), k.color(accent), k.z(50)]);
    const bannerText = k.add([k.text(bannerMessage, { size: 14 }), k.pos(320, 622), k.anchor("center"), k.color(accent), k.z(50)]);

    const player = k.add([k.pos(playerState.x, playerState.y), k.z(10), "player"]);
    const heroGlow = player.add([
      k.circle(24), k.pos(0, 0), k.anchor("center"), k.color(accent), k.opacity(0.16), k.scale(1), k.z(-2),
    ]);
    player.add([k.circle(13), k.pos(0, 0), k.anchor("center"), k.color(pale), k.outline(4, accent)]);
    const spring = player.add([k.rect(5, 18), k.pos(0, 13), k.anchor("top"), k.color(mid), k.scale(1)]);
    const boot = player.add([k.rect(25, 7), k.pos(0, 31), k.anchor("center"), k.color(accent)]);
    const landingGuide = player.add([k.rect(48, 3), k.pos(-24, 25), k.color(accent), k.opacity(0.25)]);
    const shield = player.add([
      k.circle(31), k.pos(0, 0), k.anchor("center"), k.color(accent), k.opacity(0), k.outline(4, accent), k.scale(1), k.z(-1),
    ]);
    const lanceEmitter = player.add([
      k.rect(22, 5), k.pos(13, -5), k.anchor("left"), k.color(accent), k.opacity(0),
    ]);

    const foes: Foe[] = [];
    const rings: Ring[] = [];
    const sparks: Spark[] = [];
    const beams: Beam[] = [];
    const echoes: Echo[] = [];

    const ring = (x: number, y: number, radius: number, bright = true, life = 0.34) => {
      const body = k.add([
        k.circle(12), k.pos(x, y), k.anchor("center"),
        k.color(bright ? accent : pale), k.opacity(bright ? 0.72 : 0.32),
        k.outline(bright ? 4 : 2, bright ? accent : pale), k.scale(0.2), k.z(15),
      ]);
      rings.push({ body, life, maxLife: life, endScale: radius / 12 });
    };

    const burst = (x: number, y: number, amount: number, bright = true) => {
      for (let index = 0; index < amount; index += 1) {
        const angle = random() * Math.PI * 2;
        const speed = 60 + random() * 210;
        const life = 0.2 + random() * 0.34;
        const body = k.add([
          k.rect(index % 3 === 0 ? 6 : 3, 3), k.pos(x, y), k.anchor("center"),
          k.color(bright && index % 3 === 0 ? accent : pale), k.opacity(0.94), k.z(16),
        ]);
        sparks.push({ body, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life });
      }
    };

    const beam = (x1: number, y1: number, x2: number, y2: number) => {
      const length = distance(x1, y1, x2, y2);
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const body = k.add([
        k.rect(length, 4), k.pos(x1, y1), k.anchor("left"), k.rotate(angle),
        k.color(accent), k.opacity(0.92), k.outline(1, pale), k.z(14),
      ]);
      beams.push({ body, life: 0.2, maxLife: 0.2 });
    };

    const patternLabel = (kind: ThreatKind) => kind === "skitter" ? "GROUND SKITTERS" : kind === "hover" ? "HOVER WEAVE" : "CHARGE LINE";
    const powerLabel = (kind: PowerKind) => kind === "capacitor" ? "CAPACITOR" : kind === "lancer" ? "LANCER" : "PHASE OVERDRIVE";

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
      bannerMessage = "SKITTER RUSH  •  CAPACITOR AT 2s";
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

    const eliminate = (foe: Foe, source: EliminationSource) => {
      const { x, y } = foe;
      if (!removeFoe(foe)) return 0;
      kills += 1;
      burst(x, y, foe.heavy ? 8 : 5, source !== "phase");
      return 1;
    };

    const powerTrigger = (kind: PowerKind, effect: string, cleared: number) => {
      if (triggered.has(kind)) return;
      triggered.add(kind);
      playtest.event("power_trigger", {
        power: kind,
        effect,
        cleared,
        second: Number(elapsed.toFixed(1)),
      });
    };

    const nearestFoes = (amount: number) => [...foes]
      .sort((a, b) => distance(a.x, a.y, playerState.x, playerState.y) - distance(b.x, b.y, playerState.x, playerState.y))
      .slice(0, amount);

    const unlockPower = (kind: PowerKind) => {
      if (unlocked.has(kind)) return;
      unlocked.add(kind);
      const radius = kind === "capacitor" ? 112 : kind === "lancer" ? 86 : 104;
      ring(playerState.x, playerState.y, radius, true, 0.52);
      burst(playerState.x, playerState.y, 24, true);
      playtest.event("power_unlock", {
        power: kind,
        count: unlocked.size,
        second: Number(elapsed.toFixed(1)),
      });
      if (kind === "capacitor") {
        bannerMessage = "CAPACITOR OVERDRIVE  •  LAND + ECHO";
      } else if (kind === "lancer") {
        bannerMessage = "LANCER OVERDRIVE  •  TRIPLE CHAIN";
        lancerClock = 0.08;
        lanceEmitter.opacity = 0.96;
      } else {
        bannerMessage = "PHASE OVERDRIVE  •  CONTACT BECOMES CRUSH";
        phaseCharges = 1;
        phaseRechargeClock = 0;
        shield.opacity = 0.58;
      }
      bannerClock = 2.0;
    };

    const spawnFoe = (kind: ThreatKind, side?: "left" | "right", lane = 0) => {
      if (foes.length >= 88) return;
      const fromLeft = side ? side === "left" : random() < 0.5;
      const heavy = kind === "skitter" && elapsed > 28 && random() < Math.min(0.24, elapsed * 0.0025);
      const size = kind === "charger" ? 14 : heavy ? 13 : kind === "hover" ? 10 : 7 + random() * 3;
      const x = fromLeft ? arena.left + size + 4 : arena.right - size - 4;
      const baseY = kind === "hover" ? heroGroundY - 82 - lane * 62 : arena.floor - size - 2;
      const y = baseY;
      const actor = k.add([k.pos(x, y), k.z(5), `threat-${kind}`]);
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

    const phaseCrush = (contact: Foe) => {
      phaseCharges = 0;
      phaseRechargeClock = 6.5;
      shield.opacity = 0.08;
      invulnerable = 0.42;
      shake = 10;
      const before = kills;
      for (const foe of [...foes]) {
        if (distance(foe.x, foe.y, playerState.x, playerState.y) < 132 + foe.size) eliminate(foe, "phase");
      }
      if (foes.includes(contact)) eliminate(contact, "phase");
      const cleared = kills - before;
      ring(playerState.x, playerState.y, 142, true, 0.5);
      ring(playerState.x, playerState.y, 92, false, 0.34);
      burst(playerState.x, playerState.y, 34, true);
      bannerMessage = `PHASE CRUSH  •  ${cleared} CONVERTED`;
      bannerClock = 1.6;
      powerTrigger("phase", "contact_crushing_detonation", cleared);
    };

    const hurt = (source: "contact" | "rough_landing", contact?: Foe) => {
      if (invulnerable > 0 || ended) return;
      if (source === "contact" && phaseCharges > 0 && contact) {
        phaseCrush(contact);
        return;
      }
      health -= 1;
      invulnerable = 1.15;
      cleanStreak = 0;
      shake = 7;
      bannerMessage = source === "rough_landing" ? "LATE LANDING  •  FIND THE BEAT" : "SWARM CONTACT  •  STOMP CLEARER";
      bannerClock = 1.5;
      ring(playerState.x, playerState.y, 36, false);
      playtest.event("damage", { source, health, powers: unlocked.size, second: Math.floor(elapsed), pattern: currentPattern });
      if (health > 0) return;
      ended = true;
      titleText.text = "THE STORM BROKE THE BOUNCE";
      bannerText.text = `${unlocked.size}/3 OVERDRIVES  •  ${kills} CLEARED  •  R RESTARTS`;
      bannerText.color = accent;
      playtest.event("death", { source, cleared: kills, powers_unlocked: [...unlocked], powers_triggered: [...triggered] });
      playtest.event("round_end", { outcome: "overrun", cleared: kills, powers: unlocked.size, best_streak: bestStreak });
      playtest.fail("swarm_broke_the_bounce");
    };

    const fireEcho = (echo: Echo) => {
      const before = kills;
      ring(echo.x, echo.y, echo.radius, true, 0.44);
      ring(echo.x, echo.y, echo.radius * 0.64, false, 0.3);
      burst(echo.x, echo.y, 22, true);
      for (const foe of [...foes]) {
        if (distance(foe.x, foe.y, echo.x, heroGroundY) < echo.radius + foe.size) eliminate(foe, "capacitor");
      }
      const cleared = kills - before;
      bestCascade = Math.max(bestCascade, cleared);
      if (cleared > 0) {
        bannerMessage = `CAPACITOR ECHO  •  ×${cleared}`;
        bannerClock = 0.8;
      }
    };

    const land = () => {
      const wasStomp = stompArmed && stompAge <= 0.9;
      const powered = unlocked.has("capacitor");
      const pulseRadius = wasStomp ? (powered ? 118 : 68) : (powered ? 68 : 34);
      const before = kills;
      ring(playerState.x, arena.floor - 3, pulseRadius, wasStomp || powered, powered ? 0.42 : 0.34);
      burst(playerState.x, arena.floor - 8, wasStomp ? (powered ? 24 : 18) : 8, wasStomp || powered);
      for (const foe of [...foes]) {
        if (distance(foe.x, foe.y, playerState.x, heroGroundY) < pulseRadius + foe.size) eliminate(foe, powered ? "capacitor" : "landing");
      }
      const landingKills = kills - before;
      if (powered) {
        echoes.push({ x: playerState.x, y: arena.floor - 3, delay: 0.22, radius: wasStomp ? 158 : 112 });
        powerTrigger("capacitor", "landing_wave_with_delayed_echo", landingKills);
      }
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
      playtest.event("decision", { kind: "stomp", height: Math.round(heroGroundY - playerState.y), powers: unlocked.size, second: Math.floor(elapsed) });
    };

    const fireLancer = () => {
      const targets = nearestFoes(3);
      if (targets.length === 0) return;
      let sourceX = playerState.x;
      let sourceY = playerState.y - 5;
      let cleared = 0;
      for (const target of targets) {
        beam(sourceX, sourceY, target.x, target.y);
        ring(target.x, target.y, 30, true, 0.25);
        const targetX = target.x;
        const targetY = target.y;
        cleared += eliminate(target, "lancer");
        sourceX = targetX;
        sourceY = targetY;
      }
      shake = Math.max(shake, 3);
      if (cleared > 0) powerTrigger("lancer", "triple_chain_auto_strike", cleared);
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
      if (elapsed >= 1.7) unlockPower("capacitor");
      if (elapsed >= 5.7) unlockPower("lancer");
      if (elapsed >= 9.7) unlockPower("phase");

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
      const glowScale = 1 + Math.sin(elapsed * 9) * 0.05 + unlocked.size * 0.07;
      heroGlow.scale = k.vec2(glowScale);
      spring.scale = k.vec2(1, stompArmed ? 1.35 : clamp(0.72 + Math.abs(playerState.vy) / 1000, 0.72, 1.25));
      boot.pos = k.vec2(clamp(playerState.vx / 55, -7, 7), 31);
      shield.scale = k.vec2(1 + Math.sin(elapsed * 7) * 0.08);

      if (unlocked.has("lancer")) {
        lancerClock -= dt;
        if (lancerClock <= 0) {
          lancerClock = 1.28;
          fireLancer();
        }
      }
      if (unlocked.has("phase") && phaseCharges === 0) {
        phaseRechargeClock -= dt;
        if (phaseRechargeClock <= 0) {
          phaseCharges = 1;
          shield.opacity = 0.58;
          ring(playerState.x, playerState.y, 72, true, 0.42);
          playtest.event("phase_recharge", { second: Number(elapsed.toFixed(1)) });
          bannerMessage = "PHASE RECHARGED  •  NEXT CONTACT CRUSHES";
          bannerClock = 1.2;
        }
      }

      for (const echo of [...echoes]) {
        echo.delay -= dt;
        if (echo.delay <= 0) {
          echoes.splice(echoes.indexOf(echo), 1);
          fireEcho(echo);
        }
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
        effect.body.opacity = Math.max(0, 0.68 * (1 - progress));
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
      for (const shot of [...beams]) {
        shot.life -= dt;
        shot.body.opacity = Math.max(0, shot.life / shot.maxLife);
        if (shot.life <= 0) {
          beams.splice(beams.indexOf(shot), 1);
          k.destroy(shot.body);
        }
      }

      timerText.text = `${Math.max(0, Math.ceil(runLength - elapsed))}s`;
      statsText.text = `HEALTH  ${health}    OVERDRIVE  ${unlocked.size}/3    CLEARED  ${kills}`;
      powerText.text = `${unlocked.has("capacitor") ? "◆ CAP" : "◇ CAP"}   ${unlocked.has("lancer") ? "◆ LANCE" : "◇ LANCE"}   ${unlocked.has("phase") ? (phaseCharges > 0 ? "◆ PHASE" : "◈ PHASE") : "◇ PHASE"}`;
      powerText.color = unlocked.size > 0 ? accent : mid;
      const chainLabel = chainClock > 0 && recentChain > 1 ? `CASCADE ×${recentChain}` : stompArmed ? "STOMP ARMED" : "STEER INTO A CLUSTER  •  SPACE";
      bannerText.text = bannerClock > 0 ? bannerMessage : chainLabel;
      bannerText.color = stompArmed || bannerClock > 0 ? accent : mid;
      k.camPos(k.vec2(W / 2 + Math.sin(elapsed * 41) * shake * 0.42, H / 2 + Math.cos(elapsed * 37) * shake * 0.3));

      if (elapsed >= runLength) {
        ended = true;
        titleText.text = "THE HERO BECAME THE STORM";
        bannerText.text = `${kills} CLEARED  •  THREE OVERDRIVES TESTED  •  BEST RHYTHM ${bestStreak}`;
        bannerText.color = accent;
        k.camPos(k.vec2(W / 2, H / 2));
        playtest.event("goal", { kind: "survived", cleared: kills, powers_unlocked: [...unlocked], powers_triggered: [...triggered] });
        playtest.event("round_end", { outcome: "survived", cleared: kills, powers: unlocked.size, clean_landings: cleanLandings });
        playtest.complete({
          cleared: kills,
          powers_unlocked: [...unlocked],
          powers_triggered: [...triggered],
          clean_landings: cleanLandings,
          total_landings: landings,
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
