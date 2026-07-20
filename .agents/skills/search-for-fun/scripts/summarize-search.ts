import path from "node:path";
import { findRepositoryRoot } from "../../../../studio/server/paths.js";
import { SearchRepository } from "../../../../studio/server/repository.js";
import { atomicWriteText } from "../../../../studio/server/safe-fs.js";
import { fail, parseArguments, requiredString } from "./cli.js";

const args = parseArguments();

function scoreSummary(ratings: Record<string, number | null>): string {
  const measured = Object.entries(ratings).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return measured.length ? measured.map(([name, value]) => `${name} ${value}/5`).join(", ") : "not rated";
}

try {
  const root = await findRepositoryRoot();
  const repository = await SearchRepository.create(root);
  const searchId = requiredString(args, "search");
  const projection = await repository.loadProjection(searchId);
  const lines = [
    `# ${projection.search.title}`,
    "",
    `**Search:** \`${projection.search.id}\`  `,
    `**Phase:** ${projection.search.phase}  `,
    `**Objective revision:** ${projection.objective.revision}`,
    "",
    "## Objective",
    "",
    projection.objective.fantasy,
    "",
    `Desired feeling: ${projection.objective.desiredFeeling.join(", ")}.`,
    "",
    "## Branches",
    "",
  ];
  for (const node of projection.nodes) {
    lines.push(`### ${node.title} (\`${node.id}\`)`, "");
    lines.push(`- Role: ${node.searchRole}; edge: ${node.edgeType}; parents: ${node.parents.join(", ") || "objective"}`);
    lines.push(`- Hypothesis: ${node.hypothesis}`);
    lines.push(`- Evidence: ${node.evaluations.length} playtest(s).`);
    const latest = node.evaluations[0];
    if (latest) {
      lines.push(`- Latest ratings: ${scoreSummary(latest.ratings)}.`);
      if (latest.note) lines.push(`- Feedback: ${latest.note}`);
      if (latest.preserve) lines.push(`- Preserve: ${latest.preserve}`);
      if (latest.change) lines.push(`- Change: ${latest.change}`);
    }
    if (node.effectiveState.rejected) lines.push("- Disposition: rejected.");
    if (node.effectiveState.selected) lines.push("- Disposition: selected candidate.");
    if (node.effectiveState.favorite) lines.push("- Disposition: favorite reference.");
    if (node.effectiveState.archived) lines.push("- Disposition: archived from the default map.");
    lines.push("");
  }
  const pending = projection.commands.filter((command) => command.status === "pending");
  lines.push("## Pending commands", "");
  if (pending.length === 0) lines.push("None.", "");
  for (const command of pending) lines.push(`- \`${command.id}\`: ${command.type} ${command.nodeIds.join(", ")} — ${command.instruction || "no extra instruction"}`);
  const outcomes = projection.commands
    .filter((command) => command.status === "processed" || command.status === "error")
    .slice(0, 5);
  lines.push("", "## Recent command outcomes", "");
  if (outcomes.length === 0) lines.push("None.", "");
  for (const command of outcomes) {
    lines.push(`- \`${command.id}\`: ${command.type} ${command.nodeIds.join(", ")} — ${command.error ?? command.result?.summary ?? "completed"}`);
  }
  await atomicWriteText(path.join(root, "searches", searchId, "summary.md"), `${lines.join("\n")}\n`);
  process.stdout.write(`Updated searches/${searchId}/summary.md\n`);
} catch (error) {
  fail(error);
}
