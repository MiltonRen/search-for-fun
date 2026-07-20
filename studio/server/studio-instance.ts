import { createHash } from "node:crypto";
import path from "node:path";

export const DEFAULT_STUDIO_PORT = 4317;

export interface StudioHealth {
  ok: true;
  pid: number;
  repositoryId: string;
}

export function studioRepositoryId(repositoryRoot: string): string {
  return createHash("sha256").update(path.resolve(repositoryRoot)).digest("hex").slice(0, 16);
}

export function parseStudioPort(value = process.env.SEARCH_FOR_FUN_PORT): number {
  const port = Number(value ?? DEFAULT_STUDIO_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SEARCH_FOR_FUN_PORT must be a whole TCP port between 1 and 65535");
  }
  return port;
}

export function isStudioHealth(value: unknown): value is StudioHealth {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioHealth>;
  return (
    candidate.ok === true &&
    Number.isInteger(candidate.pid) &&
    Number(candidate.pid) > 0 &&
    typeof candidate.repositoryId === "string" &&
    /^[a-f0-9]{16}$/.test(candidate.repositoryId)
  );
}
