import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import {
  DEFAULT_PROCESS_TIMEOUT_MS,
  MAX_OUTPUT_BUFFER_BYTES,
  MISSING_NPM,
  MISSING_TREE_SITTER_CLI,
  NPM_BIN,
  TREE_SITTER_BIN,
} from "./constants.ts";
import { managedRoot } from "./managed-grammar-cache.ts";
import { formatSize, stripAnsi } from "./output.ts";
import type { TreeSitterRunOptions, TreeSitterRunResult } from "./types.ts";

interface CommandExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
  outputCapped: boolean;
}

function commandHasPathSeparator(command: string): boolean {
  return isAbsolute(command) || command.includes("/") || command.includes("\\");
}

function executableNames(command: string): string[] {
  if (process.platform !== "win32") return [command];

  const extensions = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  const lowerCommand = command.toLowerCase();
  const alreadyHasExtension = extensions.some((ext) => lowerCommand.endsWith(ext.toLowerCase()));
  return alreadyHasExtension ? [command] : [command, ...extensions.map((ext) => `${command}${ext}`)];
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(command: string, missingMessage: string, envName: string): Promise<string> {
  if (commandHasPathSeparator(command)) {
    if (await isExecutable(command)) return command;
    throw new Error(`${missingMessage}\n\nConfigured ${envName} was: ${command}`);
  }

  for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
    for (const name of executableNames(command)) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }

  throw new Error(missingMessage);
}

function collectOutput(result: CommandExecResult, name: string): string {
  let output = stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.outputCapped) {
    output += `${output ? "\n\n" : ""}[Output exceeded ${formatSize(
      MAX_OUTPUT_BUFFER_BYTES,
    )}; the ${name} process was terminated and remaining output was discarded.]`;
  }
  return output;
}

async function resolveTreeSitterBin(): Promise<string> {
  return resolveExecutable(TREE_SITTER_BIN, MISSING_TREE_SITTER_CLI, "TREE_SITTER_BIN");
}

async function resolveNpmBin(): Promise<string> {
  return resolveExecutable(NPM_BIN, MISSING_NPM, "NPM_BIN");
}

async function execCommand(
  command: string,
  args: string[],
  signal: AbortSignal | undefined,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = {},
): Promise<CommandExecResult> {
  return new Promise((resolve, reject) => {
    // On POSIX the child leads its own process group so timeouts and output
    // caps can signal the whole tree (npm and tree-sitter spawn children).
    const useProcessGroup = process.platform !== "win32";
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: useProcessGroup,
    });

    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let outputCapped = false;
    let killed = false;
    let terminated = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let forceKillTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (forceKillTimeoutId) clearTimeout(forceKillTimeoutId);
      signal?.removeEventListener("abort", kill);
      proc.removeListener("error", onError);
      proc.removeListener("close", onClose);
    };

    const signalProc = (sig: NodeJS.Signals) => {
      if (useProcessGroup && proc.pid) {
        try {
          process.kill(-proc.pid, sig);
          return;
        } catch {
          // Group already gone; fall through to the direct child.
        }
      }
      proc.kill(sig);
    };

    const terminate = () => {
      if (terminated) return;
      terminated = true;
      signalProc("SIGTERM");
      forceKillTimeoutId = setTimeout(() => {
        if (!settled) signalProc("SIGKILL");
      }, 5_000);
    };

    const kill = () => {
      killed = true;
      terminate();
    };

    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onClose = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ stdout, stderr, code: code ?? 0, killed, outputCapped });
    };

    const appendChunk = (chunk: Buffer, append: (text: string) => void) => {
      if (outputCapped) return;
      outputBytes += chunk.length;
      append(chunk.toString());
      if (outputBytes > MAX_OUTPUT_BUFFER_BYTES) {
        outputCapped = true;
        terminate();
      }
    };

    proc.stdout?.on("data", (chunk) => appendChunk(chunk, (text) => {
      stdout += text;
    }));
    proc.stderr?.on("data", (chunk) => appendChunk(chunk, (text) => {
      stderr += text;
    }));
    proc.once("error", onError);
    proc.once("close", onClose);

    if (signal?.aborted) kill();
    else signal?.addEventListener("abort", kill, { once: true });

    if (timeoutMs > 0) timeoutId = setTimeout(kill, timeoutMs);
  });
}

export async function runTreeSitter(
  args: string[],
  signal: AbortSignal | undefined,
  options: TreeSitterRunOptions = {},
): Promise<TreeSitterRunResult> {
  const command = await resolveTreeSitterBin();
  const cacheRoot = join(managedRoot(), "cache");
  await mkdir(join(cacheRoot, "tree-sitter", "lock"), { recursive: true });
  const result = await execCommand(command, args, signal, options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS, {
    XDG_CACHE_HOME: cacheRoot,
  });

  if (result.killed) {
    throw new Error(`tree-sitter ${args.join(" ")} timed out or was cancelled.`);
  }

  const output = collectOutput(result, "tree-sitter");
  if (options.throwOnNonZero !== false && result.code !== 0 && !result.outputCapped) {
    throw new Error(
      `tree-sitter ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`,
    );
  }

  return { command, args, output, code: result.code };
}

export async function runNpm(
  args: string[],
  signal: AbortSignal | undefined,
  processTimeoutMs: number,
): Promise<TreeSitterRunResult> {
  const command = await resolveNpmBin();
  await mkdir(join(managedRoot(), "npm-cache"), { recursive: true });
  const result = await execCommand(command, args, signal, processTimeoutMs, {
    npm_config_cache: join(managedRoot(), "npm-cache"),
  });
  if (result.killed) throw new Error(`npm ${args.join(" ")} timed out or was cancelled.`);
  const output = collectOutput(result, "npm");
  if (result.code !== 0 && !result.outputCapped) {
    throw new Error(`npm ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`);
  }
  return { command, args, output, code: result.code };
}
