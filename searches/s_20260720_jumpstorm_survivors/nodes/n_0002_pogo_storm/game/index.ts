import type { GameObj, KAPLAYCtx } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

type Foe = GameObj & {
  speed: number;
  size: number;
  hover: boolean;
  heavy: boolean;
  phase: number;
};

type Orb = GameObj & { cooldown: number };
type Ring = GameObj & { life: number; maxLife: number; endScale: number };
type Spark = GameObj & { vx: number; vy: number; life: number; maxLife: number };

const game: SearchForFunGame = {
  id: "n_0002_pogo_storm",
  title: "Pogo Storm",
  instructions: "Keyboard: Left / Right steer in air. Space stomps. R restarts.",

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
    const unit = (x: number, y: number) => {
      const length = Math.hypot(x, y);
      return length > 0.001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
    };

    let randomState = runtime.seed >>> 0;
    const random = () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    };

    let started = false;
    let ended = false;
    let elapsed = 0;
    let spawnClock = 0.7;
    let vx = 0;
    let vy = 0;
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
    let arsenalXp = 0;
    let arsenal = 0;
    let bestCascade = 0;
    let recentChain = 0;
    let chainClock = 0;
    let shake = 0;
    let bannerClock = 4;
    let bannerMessage = "PRESS A DIRECTION  •  BEGIN THE BOUNCE";

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

    const titleText = k.add([k.text("POGO STORM", { size: 25 }), k.pos(24, 18), k.color(pale)]);
    const timerText = k.add([k.text(`${runLength}s`, { size: 24 }), k.pos(568, 20), k.color(accent)]);
    const statsText = k.add([k.text("HEALTH  5    ORBIT  0    CLEARED  0", { size: 16 }), k.pos(25, 59), k.color(mid)]);
    const rhythmBack = k.add([k.rect(220, 7), k.pos(395, 88), k.color(55, 57, 56)]);
    void rhythmBack;
    const rhythmBar = k.add([k.rect(220, 7), k.pos(395, 88), k.color(accent), k.scale(0, 1)]);
    const bannerText = k.add([k.text(bannerMessage, { size: 14 }), k.pos(320, 622), k.anchor("center"), k.color(accent)]);

    const shadow = k.add([k.circle(18), k.pos(320, arena.floor - 2), k.anchor("center"), k.color(0, 0, 0), k.opacity(0.38), k.scale(1.45, 0.42)]);
    const landingGuide = k.add([k.rect(48, 3), k.pos(296, arena.floor - 7), k.color(accent), k.opacity(0.25)]);
    const heroGlow = k.add([k.circle(24), k.pos(320, heroGroundY), k.anchor("center"), k.color(accent), k.opacity(0.16), k.scale(1)]);
    const hero = k.add([k.circle(13), k.pos(320, heroGroundY), k.anchor("center"), k.color(pale), k.outline(4, accent)]);
    const spring = k.add([k.rect(5, 18), k.pos(320, heroGroundY + 14), k.anchor("top"), k.color(mid), k.scale(1)]);
    const boot = k.add([k.rect(25, 7), k.pos(320, heroGroundY + 31), k.anchor("center"), k.color(accent)]);

    const foes: Foe[] = [];
    const orbs: Orb[] = [];
    const rings: Ring[] = [];
    const sparks: Spark[] = [];

    const ring = (x: number, y: number, radius: number, bright = true) => {
      rings.push(k.add([
        k.circle(12),
        k.pos(x, y),
        k.anchor("center"),
        k.color(bright ? accent : pale),
        k.opacity(bright ? 0.68 : 0.32),
        k.outline(bright ? 4 : 2, bright ? accent : pale),
        k.scale(0.2),
        { life: 0.34, maxLife: 0.34, endScale: radius / 12 },
      ]) as Ring);
    };

    const burst = (x: number, y: number, amount: number, bright = true) => {
      for (let index = 0; index < amount; index += 1) {
        const angle = random() * Math.PI * 2;
        const speed = 60 + random() * 170;
        const life = 0.2 + random() * 0.28;
        sparks.push(k.add([
          k.rect(index % 3 === 0 ? 5 : 3, 3),
          k.pos(x, y),
          k.anchor("center"),
          k.color(bright && index % 3 === 0 ? accent : pale),
          k.opacity(0.92),
          { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life },
        ]) as Spark);
      }
    };

    const begin = (method: string) => {
      if (started || ended) return;
      started = true;
      grounded = false;
      vy = -480;
      vx = method === "left" ? -90 : method === "right" ? 90 : 0;
      playtest.start();
      playtest.event("first_input", { method });
      bannerMessage = "LAUNCH  →  STEER  →  STOMP  →  BURST";
      bannerClock = 3;
      ring(hero.pos.x, arena.floor - 4, 46, false);
    };

    const ensureOrbiters = () => {
      while (orbs.length < arsenal) {
        orbs.push(k.add([
          k.circle(5),
          k.pos(hero.pos),
          k.anchor("center"),
          k.color(accent),
          k.outline(2, pale),
          { cooldown: 0 },
        ]) as Orb);
      }
    };

    const updateArsenal = () => {
      const next = Math.min(8, Math.floor(arsenalXp / 6));
      if (next <= arsenal) return;
      arsenal = next;
      ensureOrbiters();
      ring(hero.pos.x, hero.pos.y, 54 + arsenal * 5, true);
      burst(hero.pos.x, hero.pos.y, 12 + arsenal * 2, true);
      bannerMessage = arsenal >= 6 ? `STORM CROWN  ${arsenal}` : `ORBIT GROWS  ${arsenal}`;
      bannerClock = 1.8;
      playtest.event("goal", { kind: "arsenal_growth", orbit: arsenal, cleared: kills, second: Math.floor(elapsed) });
    };

    const removeFoe = (foe: Foe) => {
      const index = foes.indexOf(foe);
      if (index < 0) return false;
      foes.splice(index, 1);
      foe.destroy();
      return true;
    };

    const eliminate = (foe: Foe, source: "landing" | "orbit" | "cascade", depth = 0): number => {
      const x = foe.pos.x;
      const y = foe.pos.y;
      if (!removeFoe(foe)) return 0;
      kills += 1;
      arsenalXp += source === "landing" ? 1.15 : 0.7;
      burst(x, y, foe.heavy ? 7 : 4, source !== "cascade");
      let cascade = 1;
      const reactionRadius = arsenal >= 2 ? 12 + arsenal * 4.5 : 0;
      if (reactionRadius > 0 && depth < 3) {
        ring(x, y, reactionRadius, false);
        for (const other of [...foes]) {
          if (other.pos.dist(k.vec2(x, y)) < reactionRadius + other.size) {
            cascade += eliminate(other, "cascade", depth + 1);
          }
        }
      }
      if (source === "orbit") updateArsenal();
      return cascade;
    };

    const spawnFoe = (opening = false) => {
      if (foes.length >= 88) return;
      const fromLeft = random() < 0.5;
      const hover = !opening && elapsed > 10 && random() < Math.min(0.36, 0.14 + elapsed * 0.0025);
      const heavy = elapsed > 28 && random() < Math.min(0.24, elapsed * 0.0025);
      const size = heavy ? 13 : 7 + random() * 3;
      const y = hover ? arena.top + 75 + random() * (arena.floor - arena.top - 150) : arena.floor - size - 2;
      foes.push(k.add([
        heavy ? k.rect(size * 1.55, size * 1.55) : k.circle(size),
        k.pos(fromLeft ? arena.left + size + 4 : arena.right - size - 4, y),
        k.anchor("center"),
        k.color(heavy ? 112 : 150, heavy ? 115 : 153, heavy ? 113 : 151),
        k.outline(heavy ? 2 : 1, pale),
        { speed: (heavy ? 18 : 27) + random() * 10 + elapsed * 0.07, size, hover, heavy, phase: random() * Math.PI * 2 },
      ]) as Foe);
    };

    const hurt = (source: "contact" | "rough_landing") => {
      if (invulnerable > 0 || ended) return;
      health -= 1;
      invulnerable = 1.15;
      cleanStreak = 0;
      shake = 7;
      bannerMessage = source === "rough_landing" ? "LATE LANDING  •  FIND THE BEAT" : "SWARM CONTACT  •  STOMP CLEARER";
      bannerClock = 1.5;
      ring(hero.pos.x, hero.pos.y, 36, false);
      playtest.event("damage", { source, health, orbit: arsenal, second: Math.floor(elapsed) });
      if (health > 0) return;
      ended = true;
      titleText.text = "THE STORM BROKE THE BOUNCE";
      bannerText.text = `BEST RHYTHM ${bestStreak}  •  ${kills} CLEARED  •  R RESTARTS`;
      bannerText.color = accent;
      playtest.event("death", { source, cleared: kills, orbit: arsenal, clean_landings: cleanLandings });
      playtest.event("round_end", { outcome: "overrun", cleared: kills, orbit: arsenal, best_streak: bestStreak });
      playtest.fail("swarm_broke_the_bounce");
    };

    const land = () => {
      const wasStomp = stompArmed && stompAge <= 0.9;
      const pulseRadius = wasStomp ? 68 + arsenal * 6 : 34 + arsenal * 3;
      const before = kills;
      let cascade = 0;
      ring(hero.pos.x, arena.floor - 3, pulseRadius, wasStomp);
      burst(hero.pos.x, arena.floor - 8, wasStomp ? 18 + arsenal * 2 : 8, wasStomp);
      for (const foe of [...foes]) {
        if (foe.pos.dist(k.vec2(hero.pos.x, heroGroundY)) < pulseRadius + foe.size) {
          cascade += eliminate(foe, "landing");
        }
      }
      const landingKills = kills - before;
      bestCascade = Math.max(bestCascade, cascade);
      recentChain = landingKills;
      chainClock = 1.25;
      landings += 1;

      const clean = wasStomp && landingKills > 0;
      if (clean) {
        cleanLandings += 1;
        cleanStreak += 1;
        bestStreak = Math.max(bestStreak, cleanStreak);
        arsenalXp += 1.8 + Math.min(2, landingKills * 0.2);
        bannerMessage = landingKills >= 8 ? `LANDING CASCADE  ×${landingKills}` : `CLEAN STOMP  ×${landingKills}`;
        bannerClock = 1.05;
        if (cleanLandings === 1) {
          playtest.event("goal", { kind: "rhythm_found", cleared: landingKills, second: Math.floor(elapsed) });
        }
        if (cleanStreak === 4 || cleanStreak === 8) {
          playtest.event("goal", { kind: "stomp_streak", streak: cleanStreak, orbit: arsenal, second: Math.floor(elapsed) });
        }
      } else {
        cleanStreak = 0;
        if (wasStomp) {
          bannerMessage = "STOMPED EMPTY  •  STEER TOWARD THE SWARM";
          bannerClock = 0.9;
        }
      }

      updateArsenal();
      const danger = foes.some((foe) => foe.pos.dist(k.vec2(hero.pos.x, heroGroundY)) < 48 + foe.size);
      if (!wasStomp && danger) hurt("rough_landing");

      hero.pos.y = heroGroundY;
      vy = -(468 + Math.min(42, arsenal * 5));
      vx *= 0.76;
      grounded = false;
      stompArmed = false;
      stompAge = 0;
    };

    const stomp = () => {
      if (ended) return;
      begin("primary");
      if (grounded || stompCooldown > 0 || hero.pos.y > heroGroundY - 34) {
        bannerMessage = "TOO LOW  •  STOMP EARLIER";
        bannerClock = 0.7;
        return;
      }
      stompArmed = true;
      stompAge = 0;
      stompCooldown = 0.24;
      vy = Math.max(660, vy + 410);
      ring(hero.pos.x, hero.pos.y, 25, true);
      playtest.event("decision", {
        kind: "stomp",
        height: Math.round(heroGroundY - hero.pos.y),
        orbit: arsenal,
        second: Math.floor(elapsed),
      });
    };

    const directionPresses = (["left", "right"] as const).map((action) => k.onButtonPress(action, () => begin(action)));
    const stompPress = k.onButtonPress("primary", stomp);
    const restartPress = k.onButtonPress("restart", () => playtest.restart());

    for (let index = 0; index < 10; index += 1) spawnFoe(true);

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
        heroGlow.scale.x = idle;
        heroGlow.scale.y = idle;
        return;
      }

      elapsed += dt;
      spawnClock -= dt;
      if (spawnClock <= 0) {
        spawnFoe();
        if (elapsed > 36 && random() < 0.34) spawnFoe();
        if (elapsed > 62 && random() < 0.24) spawnFoe();
        spawnClock = Math.max(0.22, 0.74 - elapsed * 0.0054) * (0.78 + random() * 0.42);
      }

      const steer = Number(k.isButtonDown("right")) - Number(k.isButtonDown("left"));
      if (!grounded) {
        vx += steer * (stompArmed ? 430 : 610) * dt;
        vx *= Math.pow(0.82, dt);
        vx = clamp(vx, -245, 245);
        vy += 1120 * dt;
        hero.pos.x += vx * dt;
        hero.pos.y += vy * dt;
        if (hero.pos.x <= arena.left + 17 || hero.pos.x >= arena.right - 17) {
          hero.pos.x = clamp(hero.pos.x, arena.left + 17, arena.right - 17);
          vx *= -0.58;
          ring(hero.pos.x, hero.pos.y, 20, false);
        }
        if (hero.pos.y >= heroGroundY && vy > 0) land();
      }

      const height = clamp((heroGroundY - hero.pos.y) / 210, 0, 1);
      shadow.pos.x = hero.pos.x;
      shadow.scale.x = 1.5 - height * 0.75;
      shadow.opacity = 0.4 - height * 0.22;
      landingGuide.pos.x = hero.pos.x - 24;
      landingGuide.opacity = stompArmed ? 0.72 : 0.18 + height * 0.14;
      heroGlow.pos = hero.pos;
      heroGlow.opacity = invulnerable > 0 ? 0.42 + Math.sin(elapsed * 25) * 0.28 : 0.13 + (stompArmed ? 0.28 : 0);
      const glowScale = 1 + Math.sin(elapsed * 9) * 0.05 + arsenal * 0.025;
      heroGlow.scale.x = glowScale;
      heroGlow.scale.y = glowScale;
      spring.pos = k.vec2(hero.pos.x, hero.pos.y + 13);
      spring.scale.y = stompArmed ? 1.35 : clamp(0.72 + Math.abs(vy) / 1000, 0.72, 1.25);
      boot.pos = k.vec2(hero.pos.x + clamp(vx / 55, -7, 7), hero.pos.y + 31);

      for (let index = 0; index < orbs.length; index += 1) {
        const orb = orbs[index];
        orb.cooldown = Math.max(0, orb.cooldown - dt);
        const orbitRadius = 28 + Math.floor(index / 4) * 11;
        const angle = elapsed * (2.5 + arsenal * 0.09) + index * (Math.PI * 2 / Math.max(1, orbs.length));
        orb.pos = k.vec2(hero.pos.x + Math.cos(angle) * orbitRadius, hero.pos.y + Math.sin(angle) * orbitRadius * 0.72);
        if (orb.cooldown <= 0) {
          const target = foes.find((foe) => foe.pos.dist(orb.pos) < foe.size + 8);
          if (target) {
            const cascade = eliminate(target, "orbit");
            bestCascade = Math.max(bestCascade, cascade);
            recentChain = cascade;
            chainClock = 0.7;
            orb.cooldown = 0.3;
            ring(orb.pos.x, orb.pos.y, 18 + arsenal * 2, true);
          }
        }
      }

      for (const foe of [...foes]) {
        foe.phase += dt * (foe.hover ? 3.4 : 5.2);
        if (foe.hover) {
          const chase = unit(hero.pos.x - foe.pos.x, hero.pos.y - foe.pos.y);
          foe.pos.x = clamp(foe.pos.x + chase.x * foe.speed * dt, arena.left + foe.size, arena.right - foe.size);
          foe.pos.y = clamp(foe.pos.y + (chase.y * foe.speed + Math.sin(foe.phase) * 13) * dt, arena.top + foe.size, arena.floor - 35);
        } else {
          const direction = Math.sign(hero.pos.x - foe.pos.x);
          foe.pos.x = clamp(foe.pos.x + direction * foe.speed * dt, arena.left + foe.size, arena.right - foe.size);
          foe.pos.y = arena.floor - foe.size - 2 + Math.sin(foe.phase) * 1.5;
        }
        if (foe.pos.dist(hero.pos) < foe.size + 14) hurt("contact");
      }

      for (const effect of [...rings]) {
        effect.life -= dt;
        const progress = 1 - effect.life / effect.maxLife;
        const scale = 0.2 + (effect.endScale - 0.2) * progress;
        effect.scale.x = scale;
        effect.scale.y = scale;
        effect.opacity = Math.max(0, 0.65 * (1 - progress));
        if (effect.life <= 0) {
          const index = rings.indexOf(effect);
          if (index >= 0) rings.splice(index, 1);
          effect.destroy();
        }
      }
      for (const spark of [...sparks]) {
        spark.life -= dt;
        spark.pos.x += spark.vx * dt;
        spark.pos.y += spark.vy * dt;
        spark.vy += 280 * dt;
        spark.opacity = Math.max(0, spark.life / spark.maxLife);
        if (spark.life <= 0) {
          const index = sparks.indexOf(spark);
          if (index >= 0) sparks.splice(index, 1);
          spark.destroy();
        }
      }

      timerText.text = `${Math.max(0, Math.ceil(runLength - elapsed))}s`;
      statsText.text = `HEALTH  ${health}    ORBIT  ${arsenal}    CLEARED  ${kills}`;
      rhythmBar.scale.x = Math.min(1, (arsenalXp % 6) / 6);
      rhythmBar.color = health <= 2 ? k.rgb(222, 112, 89) : accent;
      const chainLabel = chainClock > 0 && recentChain > 1 ? `CASCADE ×${recentChain}` : stompArmed ? "STOMP ARMED" : "STEER INTO A CLUSTER  •  SPACE";
      bannerText.text = bannerClock > 0 ? bannerMessage : chainLabel;
      bannerText.color = stompArmed || bannerClock > 0 ? accent : mid;
      k.camPos(W / 2 + Math.sin(elapsed * 41) * shake * 0.42, H / 2 + Math.cos(elapsed * 37) * shake * 0.3);

      if (!ended && elapsed >= runLength) {
        ended = true;
        titleText.text = "THE HERO BECAME THE STORM";
        bannerText.text = `${kills} CLEARED  •  ORBIT ${arsenal}  •  BEST RHYTHM ${bestStreak}`;
        bannerText.color = accent;
        k.camPos(W / 2, H / 2);
        playtest.event("goal", { kind: "survived", cleared: kills, orbit: arsenal, best_streak: bestStreak, best_cascade: bestCascade });
        playtest.event("round_end", { outcome: "survived", cleared: kills, orbit: arsenal, clean_landings: cleanLandings });
        playtest.complete({ cleared: kills, orbit: arsenal, clean_landings: cleanLandings, best_streak: bestStreak, best_cascade: bestCascade, health });
      }
    });

    playtest.ready();
    return () => {
      for (const handle of directionPresses) handle.cancel();
      stompPress.cancel();
      restartPress.cancel();
      update.cancel();
      k.camPos(W / 2, H / 2);
    };
  },
};

export default game;
