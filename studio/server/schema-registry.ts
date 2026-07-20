import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export type SchemaName = "search" | "objective" | "node" | "evaluation" | "command" | "event" | "scout-result";

const FILES: Record<SchemaName, string> = {
  search: "search.schema.json",
  objective: "objective.schema.json",
  node: "node.schema.json",
  evaluation: "evaluation.schema.json",
  command: "command.schema.json",
  event: "event.schema.json",
  "scout-result": "scout-result.schema.json",
};

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return "unknown schema error";
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

export class SchemaRegistry {
  private readonly validators = new Map<SchemaName, ValidateFunction>();

  private constructor(private readonly repositoryRoot: string) {}

  static async create(repositoryRoot: string): Promise<SchemaRegistry> {
    const registry = new SchemaRegistry(repositoryRoot);
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);

    for (const [name, fileName] of Object.entries(FILES) as Array<[SchemaName, string]>) {
      const content = await readFile(path.join(repositoryRoot, "schemas", fileName), "utf8");
      registry.validators.set(name, ajv.compile(JSON.parse(content)));
    }
    return registry;
  }

  validate(name: SchemaName, value: unknown): void {
    const validator = this.validators.get(name);
    if (!validator) throw new Error(`Unknown schema: ${name}`);
    if (!validator(value)) {
      throw new Error(`${name} validation failed: ${formatErrors(validator.errors)}`);
    }
  }

  isValid(name: SchemaName, value: unknown): boolean {
    const validator = this.validators.get(name);
    return Boolean(validator?.(value));
  }
}
