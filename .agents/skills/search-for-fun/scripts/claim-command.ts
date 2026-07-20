import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import { fail, optionalString, parseArguments, printJson, requiredString } from "./cli.js";

const args = parseArguments();

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  const searchId = requiredString(args, "search");
  const requested = optionalString(args, "command");
  const projection = await repository.loadProjection(searchId);
  const command = requested
    ? projection.commands.find((candidate) => candidate.id === requested && candidate.status === "pending")
    : [...projection.commands]
        .filter((candidate) => candidate.status === "pending")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  if (!command) throw new Error("No matching pending command");
  printJson(await repository.claimPendingCommand(searchId, command.id));
} catch (error) {
  fail(error);
}
