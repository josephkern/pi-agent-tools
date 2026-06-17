import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function managedRoot(): string {
  return process.env.PI_TREE_SITTER_CLI_HOME?.trim() || join(homedir(), ".local", "share", "pi-tree-sitter-cli");
}

export function managedNodeModulesPath(): string {
  return join(managedRoot(), "node_modules");
}

export function managedPackageJsonPath(): string {
  return join(managedRoot(), "package.json");
}

export function managedConfigPath(): string {
  return join(managedRoot(), "config.json");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureManagedPackageJson(): Promise<void> {
  const root = managedRoot();
  await mkdir(root, { recursive: true });
  const packageJsonPath = managedPackageJsonPath();
  if (await fileExists(packageJsonPath)) return;

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(
      {
        name: "pi-tree-sitter-cli-managed-grammars",
        private: true,
        description: "Tool-local Tree-sitter grammar cache for @josephakern/pi-tree-sitter-cli.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function writeManagedConfig(): Promise<string> {
  await mkdir(managedRoot(), { recursive: true });
  const configPath = managedConfigPath();
  await writeFile(
    configPath,
    `${JSON.stringify({ "parser-directories": [managedNodeModulesPath()] }, null, 2)}\n`,
    "utf8",
  );
  return configPath;
}

export async function readManagedDependencies(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(managedPackageJsonPath(), "utf8");
    const parsed = JSON.parse(raw) as { dependencies?: unknown };
    if (!parsed.dependencies || typeof parsed.dependencies !== "object") return {};
    return parsed.dependencies as Record<string, string>;
  } catch {
    return {};
  }
}
