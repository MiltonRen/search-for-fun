import path from "node:path";
import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import { fail, parseArguments, printJson, requiredString } from "./cli.js";

const args = parseArguments();

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  const staging = requiredString(args, "staging");
  const node = await repository.importStagedNode(
    requiredString(args, "search"),
    path.isAbsolute(staging) ? staging : path.join(root, staging),
  );
  printJson(node);
} catch (error) {
  fail(error);
}
