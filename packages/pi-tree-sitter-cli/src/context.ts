import {
  ensureManagedPackageJson,
  fileExists,
  managedConfigPath,
  managedNodeModulesPath,
  managedPackageJsonPath,
  managedRoot,
  readManagedDependencies,
  writeManagedConfig,
} from "./managed-grammar-cache.ts";
import { runNpm, runTreeSitter } from "./process.ts";
import type { TreeSitterRunOptions, TreeSitterRunResult } from "./types.ts";

export interface ToolContext {
  runTreeSitter(
    args: string[],
    signal: AbortSignal | undefined,
    options?: TreeSitterRunOptions,
  ): Promise<TreeSitterRunResult>;
  runNpm(
    args: string[],
    signal: AbortSignal | undefined,
    processTimeoutMs: number,
  ): Promise<TreeSitterRunResult>;
  managedRoot(): string;
  managedNodeModulesPath(): string;
  managedPackageJsonPath(): string;
  managedConfigPath(): string;
  fileExists(filePath: string): Promise<boolean>;
  ensureManagedPackageJson(): Promise<void>;
  writeManagedConfig(): Promise<string>;
  readManagedDependencies(): Promise<Record<string, string>>;
}

export function createToolContext(): ToolContext {
  return {
    runTreeSitter,
    runNpm,
    managedRoot,
    managedNodeModulesPath,
    managedPackageJsonPath,
    managedConfigPath,
    fileExists,
    ensureManagedPackageJson,
    writeManagedConfig,
    readManagedDependencies,
  };
}
