import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { describe, expect, it } from "vitest";
import {
  ensureStudio,
  restartStudio,
  stopStudio,
  studioStatus,
} from "../studio/server/studio-process.js";

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

describe("managed studio lifecycle", () => {
  it(
    "ensures one process and replaces it only after a restart",
    async () => {
      const repositoryRoot = process.cwd();
      const port = await availablePort();
      try {
        const started = await ensureStudio(repositoryRoot, port);
        expect(started.status).toBe("started");
        expect(started.pid).toBeTypeOf("number");

        const existing = await ensureStudio(repositoryRoot, port);
        expect(existing.status).toBe("already-running");
        expect(existing.pid).toBe(started.pid);

        const restarted = await restartStudio(repositoryRoot, port);
        expect(restarted.status).toBe("restarted");
        expect(restarted.previousPid).toBe(started.pid);
        expect(restarted.pid).not.toBe(started.pid);

        const status = await studioStatus(repositoryRoot, port);
        expect(status.status).toBe("already-running");
        expect(status.pid).toBe(restarted.pid);
      } finally {
        const stopped = await stopStudio(repositoryRoot, port);
        expect(["stopped", "not-running"]).toContain(stopped.status);
      }
    },
    30_000,
  );

  it("refuses to stop a studio that belongs to another repository", async () => {
    const port = await availablePort();
    const decoy = createHttpServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, pid: process.pid, repositoryId: "0000000000000000" }));
    });
    await new Promise<void>((resolve, reject) => {
      decoy.once("error", reject);
      decoy.listen(port, "127.0.0.1", resolve);
    });
    try {
      await expect(restartStudio(process.cwd(), port)).rejects.toThrow(/different Search-for-fun repository/);
      expect(decoy.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        decoy.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
