import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import { fail, parseArguments, printJson, requiredString } from "./cli.js";

const args = parseArguments();

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  printJson(await repository.failCommand(
    requiredString(args, "search"),
    requiredString(args, "command"),
    requiredString(args, "error"),
  ));
} catch (error) {
  fail(error);
}
