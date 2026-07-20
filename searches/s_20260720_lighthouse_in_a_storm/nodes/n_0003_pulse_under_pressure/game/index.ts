import type { KAPLAYCtx } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

const game: SearchForFunGame = {
  id: "n_0003_pulse_under_pressure",
  title: "Pulse Under Pressure",
  instructions: "Press Space or click inside the bright window to restore the failing beam.",

  mount(k: KAPLAYCtx, playtest) {
    const meterX = 210;
    const meterWidth = 540;
    let phase = 0;
    let power = 62;
    let waves = 0;
    let started = false;
    let ended = false;
    let feedbackTimer = 0;

    k.add([k.rect(960, 540), k.pos(0, 0), k.color(7, 13, 24)]);
    k.add([k.rect(960, 142), k.pos(0, 398), k.color(9, 39, 57)]);
    k.add([k.text("SYNC THE PULSE. KEEP ONE LIGHT ALIVE.", { size: 17 }), k.pos(36, 34), k.color(144, 160, 177)]);
    const waveText = k.add([k.text("WAVE  0 / 7", { size: 17 }), k.pos(788, 34), k.color(204, 211, 216)]);

    k.add([k.rect(96, 216), k.pos(432, 208), k.color(218, 215, 198)]);
    k.add([k.rect(124, 24), k.pos(418, 191), k.color(184, 67, 65)]);
    const lantern = k.add([k.rect(68, 52), k.pos(446, 145), k.color(255, 229, 121), k.opacity(0.75)]);
    const beam = k.add([k.rect(390, 24), k.pos(514, 167), k.color(255, 229, 121), k.opacity(0.55), k.anchor("left"), k.rotate(-5), k.scale(0.72, 1)]);
    const windows = [252, 300, 348].map((y) =>
      k.add([k.rect(23, 31), k.pos(468, y), k.color(255, 137, 95), k.opacity(0.48)]),
    );

    k.add([k.text("BEAM POWER", { size: 13 }), k.pos(36, 452), k.color(126, 141, 150)]);
    k.add([k.rect(128, 13), k.pos(36, 477), k.color(35, 48, 57), k.anchor("left")]);
    const powerBar = k.add([k.rect(128, 13), k.pos(36, 477), k.color(231, 255, 95), k.anchor("left"), k.scale(power / 100, 1)]);

    k.add([k.rect(meterWidth, 10), k.pos(meterX, 475), k.color(38, 49, 60), k.anchor("left")]);
    k.add([k.rect(116, 22), k.pos(meterX + meterWidth / 2, 470), k.color(231, 255, 95), k.opacity(0.26), k.anchor("center")]);
    const marker = k.add([k.circle(10), k.pos(meterX, 475), k.color(255, 120, 189)]);
    const feedback = k.add([k.text("PRESS / CLICK TO SEND A PULSE", { size: 14 }), k.pos(480, 513), k.anchor("center"), k.color(125, 141, 151)]);

    const updateLight = () => {
      const intensity = Math.max(0.08, power / 100);
      beam.opacity = 0.12 + intensity * 0.78;
      beam.scale.x = 0.18 + intensity * 1.05;
      lantern.opacity = 0.18 + intensity * 0.82;
      windows.forEach((window) => { window.opacity = 0.12 + intensity * 0.7; });
      powerBar.scale.x = power / 100;
      powerBar.color = power < 30 ? k.rgb(255, 118, 108) : k.rgb(231, 255, 95);
    };

    k.onUpdate(() => {
      if (ended) return;
      phase = (phase + k.dt() * (0.33 + waves * 0.018)) % 1;
      marker.pos.x = meterX + (0.5 - Math.cos(phase * Math.PI * 2) * 0.5) * meterWidth;
      power = Math.max(0, power - k.dt() * 2.2);
      feedbackTimer = Math.max(0, feedbackTimer - k.dt());
      if (feedbackTimer === 0) {
        feedback.text = power < 30 ? "THE BEAM IS FAILING" : "PRESS / CLICK TO SEND A PULSE";
        feedback.color = power < 30 ? k.rgb(255, 118, 108) : k.rgb(125, 141, 151);
      }
      updateLight();
      if (power <= 0) {
        ended = true;
        feedback.text = "THE LIGHT GOES OUT — TRY AGAIN";
        feedback.color = k.rgb(255, 118, 108);
        playtest.fail("power_depleted");
      }
    });

    k.onButtonPress("primary", () => {
      if (ended) return;
      if (!started) {
        started = true;
        playtest.start();
        playtest.event("first_input");
      }
      waves += 1;
      const center = meterX + meterWidth / 2;
      const distance = Math.abs(marker.pos.x - center);
      const accuracy = Math.max(0, 1 - distance / 270);
      const gain = Math.round(-8 + accuracy * 42);
      power = Math.max(0, Math.min(100, power + gain));
      waveText.text = `WAVE  ${waves} / 7`;
      feedback.text = gain > 25 ? `CLEAN PULSE  +${gain}` : gain > 0 ? `LIGHT CATCHES  +${gain}` : `MISTIMED  ${gain}`;
      feedback.color = gain > 0 ? k.rgb(231, 255, 95) : k.rgb(255, 118, 108);
      feedbackTimer = 1.2;
      playtest.event("decision", { accuracy: Math.round(accuracy * 100), power: Math.round(power) });
      updateLight();
      if (waves >= 7) {
        ended = true;
        if (power >= 25) {
          feedback.text = "DAWN — THE BEAM STILL REACHES THE WATER";
          playtest.complete({ power: Math.round(power) });
        } else {
          feedback.text = "DAWN COMES, BUT THE BEAM DOES NOT — TRY AGAIN";
          playtest.fail("weak_at_dawn");
        }
      }
    });

    updateLight();
    playtest.ready();
  },
};

export default game;
