import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { build, type BuildResult, type Metafile } from "esbuild";
import type { NodeRecord } from "../shared/types.js";
import { assertNodeId, assertSearchId } from "./paths.js";
import { exists, readJson, safePath } from "./safe-fs.js";

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  if (!(await exists(directory))) return files;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(filePath)));
    if (entry.isFile()) files.push(filePath);
  }
  return files.sort();
}

const execFileAsync = promisify(execFile);

export async function typecheckGameEntry(repositoryRoot: string, entryPath: string): Promise<void> {
  const typecheckDirectory = path.join(repositoryRoot, ".search-for-fun", "cache", "typecheck");
  await mkdir(typecheckDirectory, { recursive: true });
  const token = createHash("sha256").update(entryPath).update(String(process.pid)).update(String(Date.now())).digest("hex").slice(0, 16);
  const configPath = path.join(typecheckDirectory, `${token}.json`);
  const tscPath = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
  await writeFile(
    configPath,
    `${JSON.stringify({
      extends: path.join(repositoryRoot, "tsconfig.json"),
      compilerOptions: { noEmit: true },
      files: [entryPath],
      include: [],
    }, null, 2)}\n`,
    "utf8",
  );
  try {
    await execFileAsync(process.execPath, [tscPath, "--project", configPath], {
      cwd: repositoryRoot,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    const details = [failure.stdout, failure.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Node typecheck failed${details ? `:\n${details}` : `: ${failure.message}`}`);
  } finally {
    await unlink(configPath).catch(() => undefined);
  }
}

function validateMetafileInputs(
  repositoryRoot: string,
  gameDirectory: string,
  metafile: Metafile,
): void {
  const allowedRepositoryRoots = [
    path.resolve(gameDirectory),
    path.join(repositoryRoot, "studio", "runtime"),
    path.join(repositoryRoot, "studio", "shared"),
  ];

  for (const input of Object.keys(metafile.inputs)) {
    const normalizedInput = input.replaceAll("\\", "/");
    if (normalizedInput.includes("virtual:node-entry")) continue;
    if (normalizedInput.startsWith("node_modules/")) {
      if (/^node_modules\/kaplay(?:\/|$)/.test(normalizedInput)) continue;
      throw new Error(`Node bundle imports a dependency outside the allowed KAPLAY runtime: ${input}`);
    }
    const absoluteInput = path.isAbsolute(input) ? input : path.resolve(repositoryRoot, input);
    if (allowedRepositoryRoots.some((root) => {
      const relative = path.relative(root, absoluteInput);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    })) {
      continue;
    }
    throw new Error(`Node bundle imports a repository file outside the allowed contract: ${input}`);
  }
}

async function buildNodeBundle(
  repositoryRoot: string,
  node: NodeRecord,
  entryPath: string,
): Promise<BuildResult> {
  const runtimeEntry = path.join(repositoryRoot, "studio", "runtime", "player-host.ts");
  const virtualSource = [
    `import game from ${JSON.stringify(entryPath)};`,
    `import { bootstrapNode } from ${JSON.stringify(runtimeEntry)};`,
    `bootstrapNode(game, ${JSON.stringify({
      searchId: node.searchId,
      nodeId: node.id,
      seed: node.runtime.seed,
      viewport: node.runtime.viewport,
    })});`,
  ].join("\n");

  const result = await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: false,
    legalComments: "none",
    metafile: true,
    alias: {
      "@search-for-fun/runtime": path.join(repositoryRoot, "studio", "runtime", "contract.ts"),
    },
    plugins: [
      {
        name: "search-for-fun-entry",
        setup(esbuild) {
          esbuild.onResolve({ filter: /^virtual:node-entry$/ }, () => ({
            path: "virtual:node-entry",
            namespace: "search-for-fun",
          }));
          esbuild.onLoad({ filter: /.*/, namespace: "search-for-fun" }, () => ({
            contents: virtualSource,
            loader: "ts",
            resolveDir: repositoryRoot,
          }));
        },
      },
    ],
    entryPoints: ["virtual:node-entry"],
  });
  validateMetafileInputs(repositoryRoot, path.dirname(entryPath), result.metafile!);
  return result;
}

export async function validateGameSource(repositoryRoot: string, entryPath: string): Promise<void> {
  const extension = path.extname(entryPath);
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Unsupported node entry extension: ${extension}`);
  await typecheckGameEntry(repositoryRoot, entryPath);
  const syntheticNode: NodeRecord = {
    schemaVersion: 1,
    id: "n_0000_validation",
    searchId: "s_20000101_validation",
    parents: [],
    generation: 0,
    edgeType: "root",
    searchRole: "readable",
    lifecycleStatus: "sealed",
    objectiveRevision: 1,
    createdAt: "2000-01-01T00:00:00.000Z",
    sealedAt: "2000-01-01T00:00:00.000Z",
    title: "Validation",
    hypothesis: "Validation fixture",
    changesFromParents: [],
    preserve: [],
    provenance: { briefId: "validation", report: "Validation" },
    runtime: {
      entry: "game/index.ts",
      viewport: { width: 960, height: 540 },
      orientation: "landscape",
      seed: 1,
      actions: ["primary"],
    },
    validation: {
      schema: "passed",
      typecheck: "passed",
      bundle: "passed",
      boot: "pending",
      consoleErrors: 0,
      screenshot: "pending",
    },
  };
  await buildNodeBundle(repositoryRoot, syntheticNode, entryPath);
}

export class NodeBundleCache {
  private readonly memory = new Map<string, Uint8Array>();

  constructor(private readonly repositoryRoot: string) {}

  private async computeHash(nodeDirectory: string, node: NodeRecord): Promise<string> {
    const hash = createHash("sha256");
    hash.update(JSON.stringify({ id: node.id, runtime: node.runtime }));
    const roots = [
      path.join(nodeDirectory, "game"),
      path.join(this.repositoryRoot, "studio", "runtime"),
    ];
    for (const root of roots) {
      for (const file of await collectFiles(root)) {
        hash.update(path.relative(this.repositoryRoot, file));
        hash.update(await readFile(file));
      }
    }
    hash.update(await readFile(path.join(this.repositoryRoot, "package-lock.json")));
    return hash.digest("hex");
  }

  async get(searchId: string, nodeId: string): Promise<{ hash: string; code: Uint8Array }> {
    assertSearchId(searchId);
    assertNodeId(nodeId);
    const nodeDirectory = await safePath(this.repositoryRoot, "searches", searchId, "nodes", nodeId);
    const node = await readJson<NodeRecord>(await safePath(nodeDirectory, "node.json"));
    if (node.searchId !== searchId || node.id !== nodeId) throw new Error("Node identity mismatch");
    if (
      node.lifecycleStatus !== "sealed" ||
      node.runtime?.entry !== "game/index.ts" ||
      node.validation?.schema !== "passed" ||
      node.validation?.typecheck !== "passed" ||
      node.validation?.bundle !== "passed"
    ) {
      throw new Error("Node is not a validated sealed KAPLAY artifact");
    }
    const entryPath = await safePath(nodeDirectory, "game", "index.ts");
    const hash = await this.computeHash(nodeDirectory, node);
    const memoryHit = this.memory.get(hash);
    if (memoryHit) return { hash, code: memoryHit };

    const cacheDirectory = path.join(this.repositoryRoot, ".search-for-fun", "cache", "bundles");
    const cachePath = path.join(cacheDirectory, `${hash}.js`);
    if (await exists(cachePath)) {
      const code = await readFile(cachePath);
      this.memory.set(hash, code);
      return { hash, code };
    }

    await typecheckGameEntry(this.repositoryRoot, entryPath);
    const result = await buildNodeBundle(this.repositoryRoot, node, entryPath);
    const code = result.outputFiles?.[0]?.contents;
    if (!code) throw new Error("Node bundler produced no JavaScript");
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachePath, code, { flag: "wx" }).catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
    this.memory.set(hash, code);
    return { hash, code };
  }
}
