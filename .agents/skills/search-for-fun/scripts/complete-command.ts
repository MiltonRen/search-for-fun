import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import { commaList, fail, parseArguments, printJson, requiredString } from "./cli.js";

const args = parseArguments();

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  const completedAt = new Date().toISOString();
  printJson(await repository.completeCommand(
    requiredString(args, "search"),
    requiredString(args, "command"),
    {
      completedAt,
      nodeIds: commaList(requiredString(args, "nodes")),
      summary: requiredString(args, "summary"),
    },
  ));
} catch (error) {
  fail(error);
}
