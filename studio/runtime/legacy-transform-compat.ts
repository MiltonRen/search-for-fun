import type { KAPLAYCtx, Vec2 } from "kaplay";

interface TransformObject {
  pos?: Vec2;
  scale?: Vec2;
  skew?: Vec2;
}

interface TransformSnapshot {
  pos?: readonly [number, number];
  scale?: readonly [number, number];
  skew?: readonly [number, number];
}

function changed(previous: readonly [number, number] | undefined, vector: Vec2): boolean {
  return !previous || previous[0] !== vector.x || previous[1] !== vector.y;
}

/**
 * Nodes sealed before transform-axis validation may mutate `obj.pos.x` or a
 * similar returned Vec2. KAPLAY v4000 does not invalidate its cached transform
 * for that mutation. Reassign only vectors whose exposed coordinates changed,
 * after all game updates and before transform/draw, so legacy nodes remain
 * playable without modifying their sealed source.
 */
export function installLegacyTransformCompatibility(k: KAPLAYCtx): void {
  const snapshots = new WeakMap<object, TransformSnapshot>();

  k.system("search-for-fun:legacy-transform-compat", () => {
    for (const gameObject of k.get("*", { recursive: true })) {
      const object = gameObject as unknown as TransformObject;
      const previous = snapshots.get(gameObject);
      const next: TransformSnapshot = {};

      if (gameObject.has("pos") && object.pos) {
        const value = object.pos;
        const coordinates = [value.x, value.y] as const;
        if (changed(previous?.pos, value)) object.pos = k.vec2(...coordinates);
        next.pos = coordinates;
      }
      if (gameObject.has("scale") && object.scale) {
        const value = object.scale;
        const coordinates = [value.x, value.y] as const;
        if (changed(previous?.scale, value)) object.scale = k.vec2(...coordinates);
        next.scale = coordinates;
      }
      if (gameObject.has("skew") && object.skew) {
        const value = object.skew;
        const coordinates = [value.x, value.y] as const;
        if (changed(previous?.skew, value)) object.skew = k.vec2(...coordinates);
        next.skew = coordinates;
      }

      snapshots.set(gameObject, next);
    }
  }, [k.SystemPhase.AfterUpdate]);
}
