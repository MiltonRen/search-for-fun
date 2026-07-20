export function parseArguments(values = process.argv.slice(2)): Map<string, string | true> {
  const result = new Map<string, string | true>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result.set(key, true);
    else {
      result.set(key, next);
      index += 1;
    }
  }
  return result;
}

export function requiredString(argumentsMap: Map<string, string | true>, name: string): string {
  const value = argumentsMap.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing required --${name}`);
  return value.trim();
}

export function optionalString(argumentsMap: Map<string, string | true>, name: string): string | undefined {
  const value = argumentsMap.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function commaList(value: string | undefined): string[] {
  return value ? value.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

export function pipeList(value: string | undefined): string[] {
  return value ? value.split("|").map((part) => part.trim()).filter(Boolean) : [];
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function fail(error: unknown): never {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
