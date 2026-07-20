import type { KAPLAYCtx, Vec2 } from "kaplay";
import { describe, expect, it, vi } from "vitest";
import { RUNTIME_PROTOCOL_VERSION, isRuntimeMessage } from "../studio/runtime/contract.js";
import { installLegacyTransformCompatibility } from "../studio/runtime/legacy-transform-compat.js";

describe("runtime protocol", () => {
  it("accepts close requests sent by a focused game iframe", () => {
    expect(isRuntimeMessage({
      kind: "sff:runtime",
      protocol: RUNTIME_PROTOCOL_VERSION,
      sessionId: "session-test",
      nonce: "nonce-test",
      nodeId: "n_0000_test",
      runId: 0,
      event: "close_requested",
      atMs: 100,
    })).toBe(true);
  });

  it("repairs legacy nested Vec2 writes after update without touching unchanged transforms", () => {
    let exposedPosition = { x: 10, y: 20 } as Vec2;
    let exposedScale = { x: 1, y: 1 } as Vec2;
    const gameObject = {
      has: (component: string) => component === "pos" || component === "scale",
    } as unknown as { has(component: string): boolean; pos: Vec2; scale: Vec2 };
    const positionSetter = vi.fn((value: Vec2) => { exposedPosition = value; });
    const scaleSetter = vi.fn((value: Vec2) => { exposedScale = value; });
    Object.defineProperties(gameObject, {
      pos: { get: () => exposedPosition, set: positionSetter },
      scale: { get: () => exposedScale, set: scaleSetter },
    });

    let afterUpdate: (() => void) | undefined;
    const system = vi.fn((_name: string, callback: () => void, _phases: unknown[]) => {
      afterUpdate = callback;
    });
    const k = {
      SystemPhase: { AfterUpdate: 3 },
      get: () => [gameObject],
      system,
      vec2: (x: number, y: number) => ({ x, y }),
    } as unknown as KAPLAYCtx;

    installLegacyTransformCompatibility(k);
    expect(system).toHaveBeenCalledWith(
      "search-for-fun:legacy-transform-compat",
      expect.any(Function),
      [3],
    );

    afterUpdate?.();
    expect(positionSetter).toHaveBeenCalledTimes(1);
    expect(scaleSetter).toHaveBeenCalledTimes(1);

    exposedPosition.x = 42;
    afterUpdate?.();
    expect(positionSetter).toHaveBeenCalledTimes(2);
    expect(gameObject.pos).toMatchObject({ x: 42, y: 20 });
    expect(scaleSetter).toHaveBeenCalledTimes(1);

    afterUpdate?.();
    expect(positionSetter).toHaveBeenCalledTimes(2);
    expect(scaleSetter).toHaveBeenCalledTimes(1);
  });
});
