import kaplay, { type KAPLAYCtx } from "kaplay";
import { DEFAULT_BUTTONS } from "./input.js";
import { installLegacyTransformCompatibility } from "./legacy-transform-compat.js";

export interface KaplayRuntimeOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export function createKaplayRuntime(options: KaplayRuntimeOptions): KAPLAYCtx {
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => {
    if (values[0] !== "kaplay() was called a second time, cleaning up previous state...") {
      originalWarn(...values);
    }
  };
  let runtime: KAPLAYCtx;
  try {
    runtime = kaplay({
      global: false,
      canvas: options.canvas,
      width: options.width,
      height: options.height,
      letterbox: true,
      focus: true,
      debug: false,
      background: [10, 12, 18],
      buttons: DEFAULT_BUTTONS,
    }) as unknown as KAPLAYCtx;
  } finally {
    console.warn = originalWarn;
  }
  installLegacyTransformCompatibility(runtime);
  return runtime;
}
