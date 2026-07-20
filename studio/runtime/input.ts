import type { ButtonsDef } from "kaplay";

export const DEFAULT_BUTTONS = {
  primary: { keyboard: ["space", "enter"], mouse: "left", gamepad: "south" },
  secondary: { keyboard: ["x", "escape"], mouse: "right", gamepad: "east" },
  left: { keyboard: ["left", "a"], gamepad: "dpad-left" },
  right: { keyboard: ["right", "d"], gamepad: "dpad-right" },
  up: { keyboard: ["up", "w"], gamepad: "dpad-up" },
  down: { keyboard: ["down", "s"], gamepad: "dpad-down" },
  pause: { keyboard: ["escape", "p"], gamepad: "start" },
  restart: { keyboard: "r", gamepad: "select" },
} satisfies ButtonsDef;
