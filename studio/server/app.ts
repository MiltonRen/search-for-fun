import { randomBytes } from "node:crypto";
import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import express from "express";
import type { CommandInput, EvaluationInput } from "./repository.js";
import { NodeBundleCache } from "./node-bundler.js";
import { assertNodeId, assertSearchId } from "./paths.js";
import { SearchRepository } from "./repository.js";
import { createWriteGuard, localHostGuard, noStore } from "./security.js";
import { studioRepositoryId } from "./studio-instance.js";

export interface AppOptions {
  repository: SearchRepository;
  bundleCache?: NodeBundleCache;
  sessionToken?: string;
}

function asyncRoute(
  handler: (request: express.Request<Record<string, string>>, response: express.Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request as express.Request<Record<string, string>>, response).catch(next);
  };
}

function playDocument(searchId: string, nodeId: string, host: string): { csp: string; html: string } {
  const scriptOrigin = `http://${host}`;
  const encodedSearchId = encodeURIComponent(searchId);
  const encodedNodeId = encodeURIComponent(nodeId);
  const bundleUrl = `${scriptOrigin}/play/${encodedSearchId}/${encodedNodeId}/bundle.js`;
  const assetRoot = `${scriptOrigin}/assets/${encodedSearchId}/${encodedNodeId}/`;
  const csp = [
    "default-src 'none'",
    `script-src ${bundleUrl}`,
    "style-src 'unsafe-inline'",
    `img-src data: blob: ${assetRoot}`,
    `media-src data: blob: ${assetRoot}`,
    `font-src data: ${assetRoot}`,
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>${nodeId}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #0a0c12; }
      body { display: grid; place-items: center; }
      canvas { width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
    </style>
  </head>
  <body>
    <script type="module" src="/play/${encodedSearchId}/${encodedNodeId}/bundle.js"></script>
  </body>
</html>`;
  return { csp, html };
}

export function createApp(options: AppOptions): { app: Express; sessionToken: string } {
  const app = express();
  const sessionToken = options.sessionToken ?? randomBytes(24).toString("hex");
  const bundleCache = options.bundleCache ?? new NodeBundleCache(options.repository.root);
  const writeGuard = createWriteGuard(sessionToken);
  const repositoryId = studioRepositoryId(options.repository.root);

  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(localHostGuard);
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(express.json({ limit: "9mb", type: "application/json" }));

  app.get("/api/health", (_request, response) => {
    noStore(response);
    response.json({ ok: true, pid: process.pid, repositoryId });
  });

  app.get("/api/session", (_request, response) => {
    noStore(response);
    response.json({ token: sessionToken });
  });

  app.get(
    "/api/searches",
    asyncRoute(async (_request, response) => {
      noStore(response);
      response.json({ searches: await options.repository.listSearches() });
    }),
  );

  app.get(
    "/api/searches/:searchId",
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      noStore(response);
      response.json(await options.repository.loadProjection(request.params.searchId));
    }),
  );

  app.get(
    "/api/searches/:searchId/nodes/:nodeId",
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      assertNodeId(request.params.nodeId);
      const projection = await options.repository.loadProjection(request.params.searchId);
      const node = projection.nodes.find((candidate) => candidate.id === request.params.nodeId);
      if (!node) {
        response.status(404).json({ error: "Node not found" });
        return;
      }
      noStore(response);
      response.json(node);
    }),
  );

  app.get(
    "/api/searches/:searchId/nodes/:nodeId/preview",
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      assertNodeId(request.params.nodeId);
      response.setHeader("Cache-Control", "private, max-age=60");
      response.sendFile(await options.repository.getPreviewPath(request.params.searchId, request.params.nodeId));
    }),
  );

  app.post(
    "/api/searches/:searchId/evaluations",
    writeGuard,
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      const record = await options.repository.recordEvaluation(
        request.params.searchId,
        request.body as EvaluationInput,
      );
      response.status(201).json(record);
    }),
  );

  app.post(
    "/api/searches/:searchId/commands",
    writeGuard,
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      const record = await options.repository.queueCommand(request.params.searchId, request.body as CommandInput);
      response.status(201).json(record);
    }),
  );

  app.post(
    "/api/searches/:searchId/nodes/:nodeId/preview",
    writeGuard,
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      assertNodeId(request.params.nodeId);
      const dataUrl = (request.body as { dataUrl?: unknown }).dataUrl;
      if (typeof dataUrl !== "string") throw new Error("Missing preview data URL");
      await options.repository.savePreview(request.params.searchId, request.params.nodeId, dataUrl);
      response.status(201).json({ ok: true });
    }),
  );

  app.post(
    "/api/searches/:searchId/nodes/:nodeId/runtime-failure",
    writeGuard,
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      assertNodeId(request.params.nodeId);
      const reason = (request.body as { reason?: unknown }).reason;
      if (typeof reason !== "string") throw new Error("Missing runtime failure reason");
      await options.repository.recordRuntimeFailure(request.params.searchId, request.params.nodeId, reason);
      response.status(201).json({ ok: true });
    }),
  );

  app.get(
    "/play/:searchId/:nodeId",
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      assertNodeId(request.params.nodeId);
      await options.repository.getNodeRecord(request.params.searchId, request.params.nodeId);
      const document = playDocument(request.params.searchId, request.params.nodeId, request.headers.host!);
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Content-Security-Policy", document.csp);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.send(document.html);
    }),
  );

  app.get(
    "/play/:searchId/:nodeId/bundle.js",
    asyncRoute(async (request, response) => {
      assertSearchId(request.params.searchId);
      assertNodeId(request.params.nodeId);
      const bundle = await bundleCache.get(request.params.searchId, request.params.nodeId);
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", `private, max-age=31536000, immutable`);
      response.setHeader("ETag", `"${bundle.hash}"`);
      response.send(Buffer.from(bundle.code));
    }),
  );

  app.get(
    /^\/assets\/([^/]+)\/([^/]+)\/(.+)$/,
    asyncRoute(async (request, response) => {
      const [, searchId, nodeId, assetPath] = request.path.match(/^\/assets\/([^/]+)\/([^/]+)\/(.+)$/) ?? [];
      if (!searchId || !nodeId || !assetPath) throw new Error("Invalid asset route");
      assertSearchId(searchId);
      assertNodeId(nodeId);
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.sendFile(await options.repository.getAssetPath(searchId, nodeId, decodeURIComponent(assetPath)));
    }),
  );

  app.use(["/api", "/play", "/assets"], (_request, response) => {
    response.status(404).json({ error: "Local studio route not found" });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = /not found/i.test(message) ? 404 : 400;
    response.status(status).json({ error: message });
  };
  app.use(errorHandler);
  return { app, sessionToken };
}
