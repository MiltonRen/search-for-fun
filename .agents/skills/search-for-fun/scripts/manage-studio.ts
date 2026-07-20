import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import {
  ensureStudio,
  restartStudio,
  stopStudio,
  studioStatus,
} from "../../../../studio/server/studio-process.js";
import { parseStudioPort } from "../../../../studio/server/studio-instance.js";
import { fail, printJson } from "./cli.js";

try {
  const root = await findRepositoryRoot();
  const port = parseStudioPort();
  const action = process.argv[2];
  if (!action || !["ensure", "restart", "stop", "status"].includes(action)) {
    throw new Error("Expected one studio action: ensure, restart, stop, or status");
  }
  const result =
    action === "ensure"
      ? await ensureStudio(root, port)
      : action === "restart"
        ? await restartStudio(root, port)
        : action === "stop"
          ? await stopStudio(root, port)
          : await studioStatus(root, port);
  printJson(result);
} catch (error) {
  fail(error);
}
