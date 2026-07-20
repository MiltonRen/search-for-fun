import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import { fail, optionalString, parseArguments } from "./cli.js";

const args = parseArguments();

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  const requested = optionalString(args, "search");
  const searchIds = requested ? [requested] : (await repository.listSearches()).map((search) => search.id);
  if (!requested && !args.has("all")) throw new Error("Pass --search <id> or --all");
  let failures = 0;
  for (const searchId of searchIds) {
    const issues = await repository.validateSearch(searchId);
    if (issues.length === 0) process.stdout.write(`✓ ${searchId}\n`);
    else {
      failures += 1;
      process.stderr.write(`✗ ${searchId}\n${issues.map((issue) => `  - ${issue}`).join("\n")}\n`);
    }
  }
  if (failures > 0) process.exit(1);
  if (searchIds.length === 0) process.stdout.write("No searches yet. Repository contracts loaded successfully.\n");
} catch (error) {
  fail(error);
}
