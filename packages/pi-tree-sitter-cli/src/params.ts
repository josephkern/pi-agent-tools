import { DEFAULT_PROCESS_TIMEOUT_MS, MAX_PROCESS_TIMEOUT_MS } from "./constants.ts";
import { managedConfigPath } from "./managed-grammar-cache.ts";

export function readString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

export function readStringArray(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings`);
  const values = value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${key} must contain only non-empty strings`);
    }
    return item;
  });
  return values;
}

export function readPositiveInteger(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

export function readStringOption(
  params: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  fallback?: string,
): string | undefined {
  const value = readString(params, key) ?? fallback;
  if (value === undefined) return undefined;
  if (!allowed.has(value)) {
    throw new Error(`${key} must be one of: ${Array.from(allowed).join(", ")}`);
  }
  return value;
}

export function readProcessTimeout(params: Record<string, unknown>, fallback: number): number {
  const value = readPositiveInteger(params, "processTimeoutMs") ?? fallback;
  if (value > MAX_PROCESS_TIMEOUT_MS) {
    throw new Error(
      `processTimeoutMs must be at most ${MAX_PROCESS_TIMEOUT_MS} (10 minutes); long runs should be narrowed, not extended.`,
    );
  }
  return value;
}

export function readBoolean(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

export function readConfigPath(params: Record<string, unknown>): string | undefined {
  const configPath = readString(params, "configPath");
  const useManagedConfig = readBoolean(params, "useManagedConfig") === true;
  if (configPath && useManagedConfig) {
    throw new Error("Use either `configPath` or `useManagedConfig`, not both.");
  }
  return useManagedConfig ? managedConfigPath() : configPath;
}

export function addConfigArg(args: string[], params: Record<string, unknown>): void {
  const configPath = readConfigPath(params);
  if (configPath) args.push("--config-path", configPath);
}

export function assertNotOptionLike(value: string, key: string): void {
  if (value.startsWith("-")) {
    throw new Error(
      `${key} entries must not start with "-" (${JSON.stringify(value)} would be parsed as a CLI flag).`,
    );
  }
}

export function readPathInputs(params: Record<string, unknown>, toolName: string): { paths: string[]; pathsFile?: string } {
  const paths = readStringArray(params, "paths");
  const pathsFile = readString(params, "pathsFile");
  if (paths.length === 0 && !pathsFile) {
    throw new Error(
      `${toolName} requires \`paths\` or \`pathsFile\`; stdin is disabled for agent tools.`,
    );
  }
  return { paths, pathsFile };
}

export function addCommonCliArgs(args: string[], params: Record<string, unknown>): number {
  addConfigArg(args, params);
  const grammarPath = readString(params, "grammarPath");
  if (grammarPath) args.push("--grammar-path", grammarPath);
  const scope = readString(params, "scope");
  if (scope) args.push("--scope", scope);
  return readProcessTimeout(params, DEFAULT_PROCESS_TIMEOUT_MS);
}
