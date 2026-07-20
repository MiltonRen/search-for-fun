import { access, readFile } from "node:fs/promises";
import path from "node:path";

export async function findRepositoryRoot(start = process.cwd()): Promise<string> {
  let current = path.resolve(start);

  while (true) {
    try {
      await access(path.join(current, "package.json"));
      const packageJson = JSON.parse(await readFile(path.join(current, "package.json"), "utf8")) as {
        name?: string;
      };
      if (packageJson.name === "search-for-fun") {
        return current;
      }
    } catch {
      // Continue walking upward until the repository marker is found.
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find the search-for-fun repository from ${start}`);
    }
    current = parent;
  }
}

export const SEARCH_ID_PATTERN = /^s_[0-9]{8}_[a-z0-9_]+$/;
export const NODE_ID_PATTERN = /^n_[0-9]{4}_[a-z0-9_]+$/;
export const COMMAND_ID_PATTERN = /^cmd_[a-zA-Z0-9_-]{1,120}$/;
export const SAFE_FILE_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export function assertSearchId(value: string): void {
  if (!SEARCH_ID_PATTERN.test(value)) {
    throw new Error("Invalid search ID");
  }
}

export function assertNodeId(value: string): void {
  if (!NODE_ID_PATTERN.test(value)) {
    throw new Error("Invalid node ID");
  }
}

export function assertCommandId(value: string): void {
  if (!COMMAND_ID_PATTERN.test(value)) {
    throw new Error("Invalid command ID");
  }
}

export function slugify(value: string, fallback = "search"): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}
