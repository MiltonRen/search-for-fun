import { constants } from "node:fs";
import {
  access,
  appendFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { JsonValue } from "../shared/types.js";

export function ensureLexicallyWithin(root: string, candidate: string): string {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return absoluteCandidate;
  }
  throw new Error("Resolved path leaves the repository boundary");
}

async function rejectSymlinkAncestors(root: string, candidate: string): Promise<void> {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = ensureLexicallyWithin(root, candidate);
  try {
    const rootInfo = await lstat(absoluteRoot);
    if (rootInfo.isSymbolicLink()) throw new Error(`Symlink paths are not allowed: ${absoluteRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  const segments = relative ? relative.split(path.sep) : [];
  let current = absoluteRoot;

  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new Error(`Symlink paths are not allowed: ${current}`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

export async function safePath(root: string, ...segments: string[]): Promise<string> {
  for (const segment of segments) {
    if (path.isAbsolute(segment) || segment === ".." || segment.includes("\0")) {
      throw new Error("Unsafe path segment");
    }
  }
  const candidate = ensureLexicallyWithin(root, path.join(root, ...segments));
  await rejectSymlinkAncestors(root, candidate);
  return candidate;
}

export async function assertRealPathWithin(root: string, candidate: string): Promise<string> {
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  return ensureLexicallyWithin(realRoot, realCandidate);
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function atomicWriteText(filePath: string, value: string): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  await writeFile(temporaryPath, value, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
}

export async function atomicWriteBuffer(filePath: string, value: Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  await writeFile(temporaryPath, value, { flag: "wx" });
  await rename(temporaryPath, filePath);
}

export async function appendJsonLine(filePath: string, value: JsonValue): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "a" });
}

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  if (!(await exists(filePath))) return [];
  const content = await readFile(filePath, "utf8");
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}`);
      }
    });
}

export async function moveAtomically(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
}

export async function withFileLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  options: { retries?: number; delayMs?: number; staleMs?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 30;
  const delayMs = options.delayMs ?? 100;
  const staleMs = options.staleMs ?? 60_000;

  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > staleMs) {
          const stalePath = `${lockPath}.stale.${Date.now()}`;
          await rename(lockPath, stalePath);
          await unlink(stalePath);
          continue;
        }
      } catch {
        continue;
      }

      if (attempt === retries) {
        throw new Error(`Timed out waiting for lock ${lockPath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!handle) throw new Error(`Could not acquire lock ${lockPath}`);

  try {
    return await operation();
  } finally {
    await handle.close();
    try {
      await unlink(lockPath);
    } catch {
      // A stale-lock recovery may already have moved the file.
    }
  }
}
