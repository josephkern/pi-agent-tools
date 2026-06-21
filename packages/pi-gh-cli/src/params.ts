import { DEFAULT_PROCESS_TIMEOUT_MS } from "./constants.ts";

export function readStringArray(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings`);
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${key} must contain only non-empty strings`);
    }
    return item;
  });
}

export function readPositiveInteger(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

export function readGhArgs(params: Record<string, unknown>): { args: string[]; processTimeoutMs: number } {
  const args = readStringArray(params, "args");
  if (args.length === 0) throw new Error("gh_cli requires at least one argument; pass args without the leading `gh`.");
  return {
    args,
    processTimeoutMs: readPositiveInteger(params, "processTimeoutMs") ?? DEFAULT_PROCESS_TIMEOUT_MS,
  };
}
