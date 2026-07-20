import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import type { ObjectiveRecord } from "../../../../studio/shared/types.js";
import { commaList, fail, optionalString, parseArguments, pipeList, printJson, requiredString } from "./cli.js";

const args = parseArguments();

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  const successMode = (optionalString(args, "success") ?? "joy") as ObjectiveRecord["successMode"];
  if (!["joy", "portfolio", "commercial", "learning", "custom"].includes(successMode)) {
    throw new Error("--success must be joy, portfolio, commercial, learning, or custom");
  }
  const session = commaList(optionalString(args, "session") ?? "30,120").map(Number);
  if (session.length !== 2 || session.some((value) => !Number.isInteger(value))) {
    throw new Error("--session must be two comma-separated whole seconds, for example 30,120");
  }
  const defaultRubric = successMode === "commercial"
    ? ["fun", "appeal", "readability", "fantasyFit", "scopeConfidence"]
    : ["fun", "readability", "fantasyFit", "replayability", "scopeConfidence"];
  const requestedRubric = commaList(optionalString(args, "rubric"));
  const search = await repository.createSearch({
    title: requiredString(args, "title"),
    fantasy: requiredString(args, "fantasy"),
    successMode,
    desiredFeeling: commaList(requiredString(args, "feel")),
    sessionLengthSeconds: [session[0]!, session[1]!],
    constraints: pipeList(optionalString(args, "constraints")),
    rubric: requestedRubric.length > 0 ? requestedRubric : defaultRubric,
    referenceGames: commaList(optionalString(args, "references")),
    avoidPatterns: pipeList(optionalString(args, "avoid")),
    innovationTarget: (optionalString(args, "innovation") as ObjectiveRecord["innovationTarget"]) ?? "balanced",
  });
  printJson(search);
} catch (error) {
  fail(error);
}
