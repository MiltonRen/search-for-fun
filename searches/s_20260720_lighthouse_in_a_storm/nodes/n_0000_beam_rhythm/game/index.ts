import type { KAPLAYCtx } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

const game: SearchForFunGame = {
  id: "n_0000_beam_rhythm",
  title: "Beam Rhythm",
  instructions: "Press Space or click when the storm charge crosses the bright window.",

  mount(k: KAPLAYCtx, playtest) {
    const W = 960;
    const H = 540;
    let attempts = 0;
    let score = 0;
    let phase = 0;
    let started = false;
    let ended = false;

    k.add([k.rect(W, H), k.pos(0, 0), k.color(7, 14, 27)]);
    k.add([k.rect(W, 145), k.pos(0, 395), k.color(8, 34, 54)]);
    for (let index = 0; index < 13; index += 1) {
      k.add([
        k.rect(105, 2),
        k.pos(index * 86 - 30, 425 + (index % 3) * 28),
        k.rotate(-4 + (index % 2) * 8),
        k.color(36, 92, 119),
        k.opacity(0.62),
      ]);
    }

    k.add([k.rect(92, 205), k.pos(434, 218), k.color(224, 220, 195), k.anchor("top")]);
    k.add([k.rect(122, 26), k.pos(419, 203), k.color(192, 63, 59), k.anchor("top")]);
    k.add([k.rect(74, 58), k.pos(443, 159), k.color(232, 190, 91), k.anchor("top")]);
    k.add([k.rect(90, 10), k.pos(435, 151), k.color(224, 220, 195), k.anchor("top")]);
    const beam = k.add([
      k.rect(390, 22),
      k.pos(518, 176),
      k.rotate(-8),
      k.color(255, 234, 132),
      k.opacity(0.18),
      k.anchor("left"),
    ]);

    k.add([k.text("KEEP THE LIGHT BETWEEN THE THUNDER", { size: 18 }), k.pos(38, 35), k.color(173, 190, 204)]);
    const scoreText = k.add([k.text("LIGHT  0", { size: 28 }), k.pos(38, 69), k.color(242, 241, 226)]);
    const attemptText = k.add([k.text("FIVE FLASHES REMAIN", { size: 14 }), k.pos(38, 108), k.color(103, 132, 154)]);

    const meterX = 150;
    const meterY = 475;
    const meterWidth = 660;
    k.add([k.rect(meterWidth, 12), k.pos(meterX, meterY), k.color(41, 59, 72), k.anchor("left")]);
    k.add([k.rect(128, 22), k.pos(meterX + meterWidth / 2, meterY - 5), k.color(231, 255, 95), k.opacity(0.25), k.anchor("center")]);
    const marker = k.add([k.circle(10), k.pos(meterX, meterY + 1), k.color(255, 125, 113), k.anchor("center")]);
    const feedback = k.add([k.text("PRESS / CLICK TO FLASH", { size: 16 }), k.pos(W / 2, 505), k.anchor("center"), k.color(150, 162, 170)]);

    k.onUpdate(() => {
      if (ended) return;
      phase = (phase + k.dt() * 0.36) % 1;
      const wave = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
      marker.pos.x = meterX + wave * meterWidth;
      beam.opacity = Math.max(0.14, 0.18 + score / 520);
    });

    k.onButtonPress("primary", () => {
      if (ended) return;
      if (!started) {
        started = true;
        playtest.start();
        playtest.event("first_input");
      }
      attempts += 1;
      const center = meterX + meterWidth / 2;
      const distance = Math.abs(marker.pos.x - center);
      const points = Math.max(0, Math.round(100 - distance * 0.75));
      score += points;
      beam.opacity = 0.95;
      feedback.text = points > 75 ? "PERFECT BEAM" : points > 35 ? "LIGHT HOLDS" : "STORM BREAKS THROUGH";
      feedback.color = points > 35 ? k.rgb(231, 255, 95) : k.rgb(255, 118, 108);
      scoreText.text = `LIGHT  ${score}`;
      attemptText.text = attempts < 5 ? `${5 - attempts} FLASH${5 - attempts === 1 ? "" : "ES"} REMAIN` : "THE STORM PASSES";
      playtest.event("decision", { points, attempt: attempts });
      if (attempts >= 5) {
        ended = true;
        if (score >= 280) {
          feedback.text = "DAWN FINDS THE LIGHTHOUSE BURNING";
          playtest.complete({ score });
        } else {
          feedback.text = "THE BEAM FADES BEFORE DAWN — TRY AGAIN";
          playtest.fail("beam_faded");
        }
      }
    });

    playtest.ready();
  },
};

export default game;
