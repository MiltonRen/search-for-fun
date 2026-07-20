import type { GameObj, KAPLAYCtx, OpacityComp, PosComp } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

type Cloud = GameObj<PosComp | OpacityComp> & { speed: number; size: number };

const game: SearchForFunGame = {
  id: "n_0002_light_pushes_back",
  title: "Light Pushes Back",
  instructions: "Press Space or click to pulse the beam. Wait longer for a stronger push.",

  mount(k: KAPLAYCtx, playtest, runtime) {
    let health = 5;
    let charge = 0.25;
    let elapsed = 0;
    let started = false;
    let ended = false;
    let randomState = runtime.seed >>> 0;
    const random = () => {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      return randomState / 4294967296;
    };

    k.add([k.rect(960, 540), k.pos(0, 0), k.color(8, 11, 27)]);
    k.add([k.rect(960, 126), k.pos(0, 414), k.color(19, 43, 68)]);
    k.add([k.text("THE STORM HAS WEIGHT. LIGHT HAS FORCE.", { size: 17 }), k.pos(36, 34), k.color(139, 151, 177)]);
    const healthText = k.add([k.text("LIGHTHOUSE  ◆ ◆ ◆ ◆ ◆", { size: 17 }), k.pos(36, 69), k.color(231, 255, 95)]);
    const timerText = k.add([k.text("DAWN  30", { size: 17 }), k.pos(805, 34), k.color(202, 208, 220)]);

    k.add([k.rect(76, 225), k.pos(105, 214), k.color(222, 218, 199)]);
    k.add([k.rect(102, 28), k.pos(92, 196), k.color(179, 68, 71)]);
    const lens = k.add([k.circle(23), k.pos(143, 191), k.color(255, 235, 130), k.opacity(0.75)]);
    const pulse = k.add([k.circle(65), k.pos(143, 191), k.color(255, 235, 130), k.opacity(0), k.scale(1, 1)]);

    const clouds: Cloud[] = [];
    for (let index = 0; index < 9; index += 1) {
      const size = 28 + random() * 35;
      const cloud = k.add([
        k.circle(size),
        k.pos(520 + random() * 520, 115 + random() * 270),
        k.color(83, 82, 112),
        k.opacity(0.52 + random() * 0.3),
        { speed: 18 + random() * 22, size },
      ]) as Cloud;
      clouds.push(cloud);
    }

    const chargeBack = k.add([k.rect(310, 10), k.pos(325, 482), k.color(36, 38, 55), k.anchor("left")]);
    void chargeBack;
    const chargeBar = k.add([k.rect(310, 10), k.pos(325, 482), k.color(255, 120, 189), k.anchor("left"), k.scale(charge, 1)]);
    const hint = k.add([k.text("CHARGE THE LENS", { size: 14 }), k.pos(480, 509), k.anchor("center"), k.color(126, 126, 149)]);

    k.onButtonPress("primary", () => {
      if (ended) return;
      if (!started) {
        started = true;
        playtest.start();
        playtest.event("first_input");
      }
      const strength = 80 + charge * 250;
      for (const cloud of clouds) {
        const distance = Math.max(80, cloud.pos.dist(lens.pos));
        cloud.pos.x += strength * (1 - Math.min(0.8, distance / 1000));
      }
      pulse.opacity = 0.55;
      pulse.scale.x = 0.4 + charge * 2.2;
      pulse.scale.y = pulse.scale.x;
      lens.opacity = 1;
      hint.text = charge > 0.72 ? "THE STORM RECOILS" : "A SMALL PUSH";
      playtest.event("decision", { charge: Math.round(charge * 100) });
      charge = 0;
    });

    k.onUpdate(() => {
      if (ended) return;
      elapsed += k.dt();
      charge = Math.min(1, charge + k.dt() * 0.22);
      chargeBar.scale.x = charge;
      pulse.opacity = Math.max(0, pulse.opacity - k.dt() * 1.8);
      pulse.scale.x += k.dt() * 2;
      pulse.scale.y = pulse.scale.x;
      lens.opacity = 0.5 + charge * 0.5;
      timerText.text = `DAWN  ${Math.max(0, Math.ceil(30 - elapsed))}`;

      for (const cloud of clouds) {
        cloud.pos.x -= cloud.speed * k.dt();
        if (cloud.pos.x < 205) {
          health -= 1;
          cloud.pos.x = 900 + random() * 180;
          cloud.pos.y = 115 + random() * 270;
          healthText.text = `LIGHTHOUSE  ${"◆ ".repeat(Math.max(0, health)).trim()}`;
          healthText.color = health <= 2 ? k.rgb(255, 118, 108) : k.rgb(231, 255, 95);
          playtest.event("damage", { health });
        }
      }
      if (health <= 0) {
        ended = true;
        hint.text = "THE STORM REACHES THE LANTERN — TRY AGAIN";
        hint.color = k.rgb(255, 118, 108);
        playtest.fail("storm_reached_lantern");
      } else if (elapsed >= 30) {
        ended = true;
        hint.text = "DAWN — THE LAST CLOUD DRIFTS BACK";
        hint.color = k.rgb(231, 255, 95);
        playtest.complete({ health });
      }
    });

    playtest.ready();
  },
};

export default game;
