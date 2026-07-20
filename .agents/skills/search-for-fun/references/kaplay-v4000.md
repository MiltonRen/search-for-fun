# KAPLAY v4000 prototype patterns

Search for Fun is pinned to `kaplay@4000.0.0-alpha.27.1`. Use the API and behavior of that exact version. Do not initialize KAPLAY; the host supplies a non-global `KAPLAYCtx` as `k`.

## Transform safety

KAPLAY v4000 caches transforms. Since alpha 25, changing a coordinate inside a returned transform vector does **not** invalidate the rendered transform. The numeric value can change while the object remains frozen on screen.

Never write an axis of `pos`, `worldPos`, `screenPos`, `scale`, or `skew`:

```ts
// Broken in the pinned KAPLAY version
player.pos.x += speed * k.dt();
player.pos.y = nextY;
enemy.scale.x = 1.2;
```

Assign the complete vector or use a component helper:

```ts
// Velocity in pixels per second; move() applies dt internally.
player.move(horizontal * speed, 0);

// An exact per-frame displacement; moveBy() does not apply dt.
player.moveBy(k.vec2(dx * k.dt(), dy * k.dt()));

// Manual simulation is fine when the rendered object receives a fresh Vec2.
state.x += state.vx * k.dt();
state.y += state.vy * k.dt();
player.pos = k.vec2(state.x, state.y);

player.moveTo(destination, speed);
player.scaleTo(1.2);
player.scale = k.vec2(scaleX, scaleY);
```

The importer rejects nested transform-axis writes so this failure cannot be sealed into a new node.

## One authoritative actor

Input and physics must move one authoritative player object. Put its decorative pieces at local coordinates as children so KAPLAY carries them with the parent transform:

```ts
const player = k.add([
  k.pos(k.center()),
  "player",
]);

player.add([
  k.circle(15),
  k.pos(0, 0),
  k.anchor("center"),
  k.color(235, 235, 235),
]);

player.add([
  k.circle(23),
  k.pos(0, 0),
  k.anchor("center"),
  k.color(255, 190, 55),
  k.opacity(0.15),
  k.z(-1),
]);

k.onUpdate(() => {
  const horizontal = Number(k.isButtonDown("right")) - Number(k.isButtonDown("left"));
  player.move(horizontal * 180, 0);
});
```

Do not create a player body, halo, boot, crest, shadow, or weapon as unrelated world objects and then synchronize each position manually. A temporary world-space effect may be separate, but it must be clearly secondary, accept no input, and destroy itself promptly.

## Threat motion

Give each moving threat one authoritative object too. For a simple chase:

```ts
const enemy = k.add([
  k.circle(12),
  k.pos(80, 80),
  k.anchor("center"),
  k.color(150, 150, 150),
  { speed: 95 },
  "enemy",
]);

enemy.onUpdate(() => {
  enemy.moveTo(player.pos, enemy.speed);
});
```

For platform physics, `body()` requires `pos()` and `area()`. Use `body({ isStatic: true })` for floors. Manual physics is allowed, but keep velocity and position in numeric state and assign a complete `Vec2` to the rendered object once per update.

On a 640 × 640 prototype, an ordinary active threat should usually move at least about 80 pixels per second unless slow movement is the mechanic. Make motion obvious enough to judge in the first few seconds.

## Required motion check

Before returning a staged node:

1. Start the game using a declared semantic action.
2. Hold a movement action for one second. Confirm the visible character—not an aura or cursor—moves.
3. Release input and confirm every attached player visual is still aligned.
4. Watch for three seconds without moving. Confirm at least one intended moving threat visibly changes position.
5. Restart and repeat once. Fix the prototype if any check fails.

