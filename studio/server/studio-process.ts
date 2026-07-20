import { execFile, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { atomicWriteJson, withFileLock } from "./safe-fs.js";
import { isStudioHealth, studioRepositoryId, type StudioHealth } from "./studio-instance.js";

const HEALTH_TIMEOUT_MS = 750;
const START_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 5_000;

interface StudioProcessRecord {
  schemaVersion: 1;
  pid: number;
  port: number;
  repositoryId: string;
  repositoryRoot: string;
  startedAt: string;
  managed: boolean;
}

export interface StudioProcessResult {
  action: "ensure" | "restart" | "stop" | "status";
  status: "started" | "already-running" | "restarted" | "stopped" | "not-running";
  pid?: number;
  previousPid?: number;
  port: number;
  url: string;
  logPath: string;
}

interface StudioPaths {
  cacheDirectory: string;
  lockPath: string;
  logPath: string;
  statePath: string;
}

function pathsFor(repositoryRoot: string, port: number): StudioPaths {
  const cacheDirectory = path.join(repositoryRoot, ".search-for-fun", "cache");
  return {
    cacheDirectory,
    lockPath: path.join(repositoryRoot, ".search-for-fun", "locks", `studio-${port}.lock`),
    logPath: path.join(cacheDirectory, `studio-${port}.log`),
    statePath: path.join(cacheDirectory, `studio-${port}.json`),
  };
}

function studioUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

function signalProcess(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function isExpectedStudioProcess(pid: number, repositoryRoot: string): Promise<boolean> {
  const expectedEntry = path.join(path.resolve(repositoryRoot), "studio", "server", "index.ts");
  return new Promise((resolve) => {
    execFile("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }, (error, stdout) => {
      resolve(!error && stdout.includes(expectedEntry));
    });
  });
}

async function readRecord(statePath: string): Promise<StudioProcessRecord | undefined> {
  try {
    const value = JSON.parse(await readFile(statePath, "utf8")) as Partial<StudioProcessRecord>;
    if (
      value.schemaVersion !== 1 ||
      !Number.isInteger(value.pid) ||
      Number(value.pid) < 1 ||
      !Number.isInteger(value.port) ||
      typeof value.repositoryId !== "string" ||
      typeof value.repositoryRoot !== "string" ||
      typeof value.startedAt !== "string" ||
      typeof value.managed !== "boolean"
    ) {
      return undefined;
    }
    return value as StudioProcessRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function removeRecord(statePath: string): Promise<void> {
  try {
    await unlink(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function fetchHealth(port: number): Promise<StudioHealth | undefined> {
  try {
    const response = await fetch(`${studioUrl(port)}/api/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const value: unknown = await response.json();
    return isStudioHealth(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(false);
      else reject(error);
    });
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      probe.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

async function waitForHealth(port: number, repositoryId: string, pid: number): Promise<StudioHealth> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const health = await fetchHealth(port);
    if (health) {
      if (health.repositoryId !== repositoryId) {
        throw new Error(`Port ${port} is serving a different Search-for-fun repository`);
      }
      if (health.pid !== pid) {
        throw new Error(`Port ${port} is serving an unexpected Search-for-fun process`);
      }
      return health;
    }
    if (!isProcessAlive(pid)) {
      throw new Error(`The studio exited during startup on port ${port}`);
    }
    await delay(125);
  }
  throw new Error(`Timed out waiting for the studio on ${studioUrl(port)}`);
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await delay(100);
  }
  return !isProcessAlive(pid);
}

async function writeRecord(
  statePath: string,
  repositoryRoot: string,
  port: number,
  health: StudioHealth,
  managed: boolean,
): Promise<void> {
  await atomicWriteJson(statePath, {
    schemaVersion: 1,
    pid: health.pid,
    port,
    repositoryId: health.repositoryId,
    repositoryRoot: path.resolve(repositoryRoot),
    startedAt: new Date().toISOString(),
    managed,
  } satisfies StudioProcessRecord);
}

async function startUnlocked(repositoryRoot: string, port: number, paths: StudioPaths): Promise<number> {
  const repositoryId = studioRepositoryId(repositoryRoot);
  const existingHealth = await fetchHealth(port);
  if (existingHealth) {
    if (existingHealth.repositoryId !== repositoryId) {
      throw new Error(`Port ${port} is already serving a different Search-for-fun repository`);
    }
    await writeRecord(paths.statePath, repositoryRoot, port, existingHealth, false);
    return existingHealth.pid;
  }
  if (!(await isPortAvailable(port))) {
    throw new Error(`Port ${port} is occupied by another local process; it was left untouched`);
  }

  await mkdir(paths.cacheDirectory, { recursive: true });
  const logDescriptor = openSync(paths.logPath, "a");
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(repositoryRoot, "studio", "server", "index.ts")],
      {
        cwd: repositoryRoot,
        detached: true,
        env: { ...process.env, SEARCH_FOR_FUN_PORT: String(port) },
        stdio: ["ignore", logDescriptor, logDescriptor],
      },
    );
  } finally {
    closeSync(logDescriptor);
  }
  if (!child.pid) throw new Error("The studio process did not return a PID");
  const pid = child.pid;
  child.unref();

  try {
    const health = await waitForHealth(port, repositoryId, pid);
    await writeRecord(paths.statePath, repositoryRoot, port, health, true);
    return pid;
  } catch (error) {
    if (isProcessAlive(pid)) signalProcess(pid, "SIGTERM");
    throw new Error(`${error instanceof Error ? error.message : String(error)}. See ${paths.logPath}`);
  }
}

async function stopUnlocked(repositoryRoot: string, port: number, paths: StudioPaths): Promise<number | undefined> {
  const repositoryId = studioRepositoryId(repositoryRoot);
  const [health, record] = await Promise.all([fetchHealth(port), readRecord(paths.statePath)]);
  if (health && health.repositoryId !== repositoryId) {
    throw new Error(`Port ${port} is serving a different Search-for-fun repository; it was left untouched`);
  }

  let pid = health?.pid;
  if (
    !pid &&
    record?.repositoryId === repositoryId &&
    record.repositoryRoot === path.resolve(repositoryRoot) &&
    record.port === port
  ) {
    pid = record.pid;
  }
  if (!pid || !isProcessAlive(pid)) {
    await removeRecord(paths.statePath);
    return undefined;
  }

  if (!health && (!record?.managed || !(await isExpectedStudioProcess(pid, repositoryRoot)))) {
    throw new Error(`Could not verify that PID ${pid} is a managed Search-for-fun studio; it was left untouched`);
  }

  signalProcess(pid, "SIGTERM");
  if (!(await waitForExit(pid, STOP_TIMEOUT_MS))) {
    signalProcess(pid, "SIGKILL");
    if (!(await waitForExit(pid, 2_000))) {
      throw new Error(`Studio process ${pid} did not stop`);
    }
  }
  await removeRecord(paths.statePath);
  return pid;
}

export async function ensureStudio(repositoryRoot: string, port: number): Promise<StudioProcessResult> {
  const paths = pathsFor(repositoryRoot, port);
  return withFileLock(paths.lockPath, async () => {
    const repositoryId = studioRepositoryId(repositoryRoot);
    const [health, record] = await Promise.all([fetchHealth(port), readRecord(paths.statePath)]);
    if (health) {
      if (health.repositoryId !== repositoryId) {
        throw new Error(`Port ${port} is already serving a different Search-for-fun repository`);
      }
      const remainsManaged = record?.pid === health.pid && record.managed;
      await writeRecord(paths.statePath, repositoryRoot, port, health, remainsManaged);
      return {
        action: "ensure",
        status: "already-running",
        pid: health.pid,
        port,
        url: studioUrl(port),
        logPath: paths.logPath,
      };
    }
    if (
      record?.repositoryId === repositoryId &&
      record.repositoryRoot === path.resolve(repositoryRoot) &&
      record.port === port &&
      isProcessAlive(record.pid)
    ) {
      await stopUnlocked(repositoryRoot, port, paths);
    }
    const pid = await startUnlocked(repositoryRoot, port, paths);
    return { action: "ensure", status: "started", pid, port, url: studioUrl(port), logPath: paths.logPath };
  });
}

export async function restartStudio(repositoryRoot: string, port: number): Promise<StudioProcessResult> {
  const paths = pathsFor(repositoryRoot, port);
  return withFileLock(paths.lockPath, async () => {
    const previousPid = await stopUnlocked(repositoryRoot, port, paths);
    const pid = await startUnlocked(repositoryRoot, port, paths);
    return {
      action: "restart",
      status: "restarted",
      pid,
      ...(previousPid ? { previousPid } : {}),
      port,
      url: studioUrl(port),
      logPath: paths.logPath,
    };
  });
}

export async function stopStudio(repositoryRoot: string, port: number): Promise<StudioProcessResult> {
  const paths = pathsFor(repositoryRoot, port);
  return withFileLock(paths.lockPath, async () => {
    const previousPid = await stopUnlocked(repositoryRoot, port, paths);
    return {
      action: "stop",
      status: previousPid ? "stopped" : "not-running",
      ...(previousPid ? { previousPid } : {}),
      port,
      url: studioUrl(port),
      logPath: paths.logPath,
    };
  });
}

export async function studioStatus(repositoryRoot: string, port: number): Promise<StudioProcessResult> {
  const paths = pathsFor(repositoryRoot, port);
  const health = await fetchHealth(port);
  if (health?.repositoryId === studioRepositoryId(repositoryRoot)) {
    return {
      action: "status",
      status: "already-running",
      pid: health.pid,
      port,
      url: studioUrl(port),
      logPath: paths.logPath,
    };
  }
  if (health) throw new Error(`Port ${port} is serving a different Search-for-fun repository`);
  return { action: "status", status: "not-running", port, url: studioUrl(port), logPath: paths.logPath };
}
