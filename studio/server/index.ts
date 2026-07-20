import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";
import { findRepositoryRoot } from "./paths.js";
import { SearchRepository } from "./repository.js";

const repositoryRoot = await findRepositoryRoot();
const repository = await SearchRepository.create(repositoryRoot);
const { app } = createApp({ repository });
const production = process.argv.includes("--production");
const port = Number(process.env.SEARCH_FOR_FUN_PORT ?? "4317");
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("SEARCH_FOR_FUN_PORT must be a whole TCP port between 1 and 65535");
}

if (production) {
  const clientRoot = path.join(repositoryRoot, "dist", "studio");
  app.use(express.static(clientRoot, { index: false, fallthrough: true }));
  app.use(async (_request, response, next) => {
    try {
      response.type("html").send(await readFile(path.join(clientRoot, "index.html"), "utf8"));
    } catch (error) {
      next(error);
    }
  });
} else {
  const vite = await createViteServer({
    root: path.join(repositoryRoot, "studio", "client"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const server = createHttpServer(app);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Search-for-fun studio: http://127.0.0.1:${port}\n`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
