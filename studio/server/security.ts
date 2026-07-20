import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function equalToken(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function localHostGuard(request: Request, response: Response, next: NextFunction): void {
  const rawHost = request.headers.host ?? "";
  const match = /^(127\.0\.0\.1|localhost)(?::([1-9][0-9]{0,4}))?$/i.exec(rawHost);
  const port = match?.[2] ? Number(match[2]) : undefined;
  if (!match || (port !== undefined && port > 65_535)) {
    response.status(403).json({ error: "This server accepts local requests only." });
    return;
  }
  next();
}

export function createWriteGuard(sessionToken: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    const expectedOrigins = new Set([`http://${host}`, `https://${host}`]);
    if (!origin || !expectedOrigins.has(origin)) {
      response.status(403).json({ error: "Write requests require the studio origin." });
      return;
    }
    const suppliedToken = request.header("x-search-for-fun-token") ?? "";
    if (!equalToken(suppliedToken, sessionToken)) {
      response.status(403).json({ error: "Invalid studio session token." });
      return;
    }
    next();
  };
}

export function noStore(response: Response): void {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
}
