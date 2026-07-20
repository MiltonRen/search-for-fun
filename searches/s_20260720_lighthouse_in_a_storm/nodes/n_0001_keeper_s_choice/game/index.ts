import type { KAPLAYCtx } from "kaplay";
import type { SearchForFunGame } from "@search-for-fun/runtime";

const game: SearchForFunGame = {
  id: "n_0001_keeper_s_choice",
  title: "Keeper's Choice",
  instructions: "Press Space or click to route the generator: BEAM → HEAT → REPAIR.",

  mount(k: KAPLAYCtx, playtest) {
    const modes = ["BEAM", "HEAT", "REPAIR"] as const;
    const colors = [k.rgb(255, 226, 117), k.rgb(255, 126, 93), k.rgb(106, 223, 198)];
    let mode = 0;
    let beam = 78;
    let heat = 72;
    let hull = 82;
    let elapsed = 0;
    let nextStorm = 4;
    let started = false;
    let ended = false;

    k.add([k.rect(960, 540), k.pos(0, 0), k.color(13, 18, 28)]);
    k.add([k.rect(960, 120), k.pos(0, 420), k.color(17, 47, 63)]);
    k.add([k.text("ONE GENERATOR. THREE PROMISES.", { size: 18 }), k.pos(40, 38), k.color(142, 158, 170)]);
    const timerText = k.add([k.text("DAWN  35", { size: 18 }), k.pos(796, 38), k.color(203, 211, 211)]);

    k.add([k.rect(112, 258), k.pos(424, 162), k.color(212, 208, 187)]);
    const lamp = k.add([k.circle(38), k.pos(480, 146), k.color(255, 226, 117), k.opacity(0.8)]);
    const windowGlow = k.add([k.rect(40, 60), k.pos(460, 292), k.color(255, 126, 93), k.opacity(0.7)]);
    const crack = k.add([k.text("╱", { size: 65 }), k.pos(457, 348), k.color(59, 78, 86), k.opacity(0.25)]);

    const rows = [
      { label: "BEAM", y: 445, color: colors[0]! },
      { label: "HEAT", y: 477, color: colors[1]! },
      { label: "HULL", y: 509, color: colors[2]! },
    ];
    const bars = rows.map((row) => {
      k.add([k.text(row.label, { size: 13 }), k.pos(38, row.y - 7), k.color(132, 145, 153)]);
      k.add([k.rect(260, 12), k.pos(110, row.y), k.color(36, 44, 51), k.anchor("left")]);
      return k.add([k.rect(260, 12), k.pos(110, row.y), k.color(row.color), k.scale(1, 1), k.anchor("left")]);
    });
    const modeText = k.add([k.text("POWER → BEAM", { size: 26 }), k.pos(650, 460), k.anchor("center"), k.color(colors[0]!)]);
    const feedback = k.add([k.text("PRESS / CLICK TO REROUTE", { size: 14 }), k.pos(650, 500), k.anchor("center"), k.color(115, 129, 140)]);

    const setMode = () => {
      modeText.text = `POWER → ${modes[mode]}`;
      modeText.color = colors[mode]!;
      lamp.opacity = mode === 0 ? 0.95 : Math.max(0.15, beam / 140);
      windowGlow.opacity = mode === 1 ? 0.9 : Math.max(0.1, heat / 140);
      crack.opacity = Math.max(0.1, (100 - hull) / 100);
    };

    k.onButtonPress("primary", () => {
      if (ended) return;
      if (!started) {
        started = true;
        playtest.start();
        playtest.event("first_input");
      }
      mode = (mode + 1) % modes.length;
      setMode();
      playtest.event("decision", { allocation: modes[mode] });
    });

    k.onUpdate(() => {
      if (ended) return;
      elapsed += k.dt();
      beam += (mode === 0 ? 8 : -5.2) * k.dt();
      heat += (mode === 1 ? 7 : -4.5) * k.dt();
      hull += (mode === 2 ? 5.5 : -1.2) * k.dt();
      beam = Math.max(0, Math.min(100, beam));
      heat = Math.max(0, Math.min(100, heat));
      hull = Math.max(0, Math.min(100, hull));
      bars[0]!.scale.x = beam / 100;
      bars[1]!.scale.x = heat / 100;
      bars[2]!.scale.x = hull / 100;
      lamp.opacity = mode === 0 ? 0.95 : Math.max(0.08, beam / 125);
      windowGlow.opacity = mode === 1 ? 0.9 : Math.max(0.08, heat / 125);
      crack.opacity = Math.max(0.08, (100 - hull) / 85);
      timerText.text = `DAWN  ${Math.max(0, Math.ceil(35 - elapsed))}`;

      if (elapsed >= nextStorm) {
        nextStorm += 4.5;
        hull = Math.max(0, hull - 13);
        feedback.text = "A WAVE HITS THE EAST WALL";
        playtest.event("damage", { hull: Math.round(hull) });
      }
      if (beam <= 0 || heat <= 0 || hull <= 0) {
        ended = true;
        const cause = beam <= 0 ? "THE SHIPS LOSE THE BEAM" : heat <= 0 ? "THE KEEPER FREEZES" : "THE EAST WALL BREAKS";
        feedback.text = `${cause} — TRY AGAIN`;
        feedback.color = k.rgb(255, 118, 108);
        playtest.fail(cause.toLowerCase().replaceAll(" ", "_"));
      } else if (elapsed >= 35) {
        ended = true;
        feedback.text = "DAWN — ALL THREE PROMISES HELD";
        feedback.color = k.rgb(231, 255, 95);
        playtest.complete({ beam: Math.round(beam), heat: Math.round(heat), hull: Math.round(hull) });
      }
    });

    setMode();
    playtest.ready();
  },
};

export default game;
