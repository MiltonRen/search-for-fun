import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../studio/server/app.js";
import { createTemporaryRepository, type TemporaryRepository } from "./helpers.js";

const temporaryRepositories: TemporaryRepository[] = [];

afterEach(async () => {
  await Promise.all(temporaryRepositories.splice(0).map((fixture) => fixture.cleanup()));
});

describe("local studio API", () => {
  it("keeps reads local and protects every write with origin and session token", async () => {
    const fixture = await createTemporaryRepository();
    temporaryRepositories.push(fixture);
    const { app } = createApp({ repository: fixture.repository, sessionToken: "test-session-token" });
    const host = "127.0.0.1:4317";

    await request(app).get("/api/searches").set("Host", host).expect(200);
    await request(app).get("/api/searches").set("Host", "evil.example").expect(403);
    await request(app).get("/api/searches").set("Host", "127.0.0.1:4317.evil").expect(403);
    const player = await request(app)
      .get(`/play/${fixture.searchId}/${fixture.nodeId}`)
      .set("Host", host)
      .expect(200);
    expect(player.headers["content-security-policy"]).toContain(
      `script-src http://${host}/play/${fixture.searchId}/${fixture.nodeId}/bundle.js`,
    );
    expect(player.headers["content-security-policy"]).toContain("connect-src 'none'");

    const payload = {
      nodeId: fixture.nodeId,
      session: { id: "api-session-123", durationSeconds: 12, restarts: 0, completed: false },
      ratings: { fun: 3, readability: 4 },
      preserve: "Motion",
      change: "Pacing",
      note: "API test",
    };
    await request(app)
      .post(`/api/searches/${fixture.searchId}/evaluations`)
      .set("Host", host)
      .send(payload)
      .expect(403);
    await request(app)
      .post(`/api/searches/${fixture.searchId}/evaluations`)
      .set("Host", host)
      .set("Origin", `http://${host}`)
      .set("X-Search-for-fun-token", "wrong")
      .send(payload)
      .expect(403);
    await request(app)
      .post(`/api/searches/${fixture.searchId}/evaluations`)
      .set("Host", host)
      .set("Origin", `http://${host}`)
      .set("X-Search-for-fun-token", "test-session-token")
      .send(payload)
      .expect(201);
  });

  it("validates crossover cardinality and returns repository-backed state", async () => {
    const fixture = await createTemporaryRepository();
    temporaryRepositories.push(fixture);
    const { app } = createApp({ repository: fixture.repository, sessionToken: "test-session-token" });
    const host = "127.0.0.1:4317";
    const headers = {
      Host: host,
      Origin: `http://${host}`,
      "X-Search-for-fun-token": "test-session-token",
    };
    await request(app)
      .post(`/api/searches/${fixture.searchId}/commands`)
      .set(headers)
      .send({ type: "cross", nodeIds: [fixture.nodeId], mode: "crossover", instruction: "" })
      .expect(400);
    await request(app)
      .post(`/api/searches/${fixture.searchId}/commands`)
      .set(headers)
      .send({ type: "expand", nodeIds: [fixture.nodeId], mode: "single", instruction: "Try more pressure" })
      .expect(201);
    const response = await request(app).get(`/api/searches/${fixture.searchId}`).set("Host", host).expect(200);
    expect(response.body.nodes).toHaveLength(1);
    expect(response.body.commands[0].status).toBe("pending");
    expect(response.body.nodes[0].effectiveState.pending).toBe(true);
  });
});
