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

export function quoteForCmdShell(value: string): string {
  if (/^[\w.:\\/-]+$/.test(value)) return value;
  // cmd.exe still expands %VAR% inside double quotes; validated tool params
  // cannot start with "-" and npm specs/paths do not legitimately contain %.
  return `"${value.replace(/"/g, '""')}"`;
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

// Process groups still alive when this process exits get a best-effort
// SIGKILL so detached children cannot outlive the harness.
const liveProcessGroups = new Set<number>();
let exitSweepRegistered = false;

function registerProcessGroup(pid: number): void {
  liveProcessGroups.add(pid);
  if (exitSweepRegistered) return;
  exitSweepRegistered = true;
  process.on("exit", () => {
    for (const groupPid of liveProcessGroups) {
      try {
        process.kill(-groupPid, "SIGKILL");
      } catch {
        // Group already gone.
      }
    }
  });
}

function collectOutput(result: CommandExecResult): string {
  return stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
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
    // Node >= 20.12 refuses to spawn .cmd/.bat directly (CVE-2024-27980);
    // route those through cmd.exe with explicit quoting.
    const useCmdShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
    const proc = spawn(
      useCmdShell ? quoteForCmdShell(command) : command,
      useCmdShell ? args.map(quoteForCmdShell) : args,
      {
        env: { ...process.env, ...env },
        shell: useCmdShell,
        stdio: ["ignore", "pipe", "pipe"],
        detached: useProcessGroup,
      },
    );

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
      // forceKillTimeoutId is deliberately not cleared; see terminate().
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
      // Fire even after the direct child closes: a grandchild in the group
      // may have trapped SIGTERM and must still be swept.
      forceKillTimeoutId = setTimeout(() => signalProc("SIGKILL"), 5_000);
      forceKillTimeoutId.unref?.();
    };

    const kill = () => {
      // If the output cap already terminated the process, keep the capped
      // result instead of reclassifying the run as timed out or cancelled.
      if (!terminated) killed = true;
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
      if (proc.pid) liveProcessGroups.delete(proc.pid);
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

    if (useProcessGroup && proc.pid) registerProcessGroup(proc.pid);

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

  const output = collectOutput(result);
  if (options.throwOnNonZero !== false && result.code !== 0 && !result.outputCapped) {
    throw new Error(
      `tree-sitter ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`,
    );
  }

  return { command, args, output, code: result.code, outputCapped: result.outputCapped };
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
  if (result.outputCapped) {
    // A capped npm run was terminated mid-operation; unlike read-only
    // tree-sitter output there is no useful partial result, only a
    // partially-mutated cache, so treat it as a failure.
    throw new Error(
      `npm ${args.join(" ")} produced more than ${formatSize(
        MAX_OUTPUT_BUFFER_BYTES,
      )} of output and was terminated; treat the operation as failed and retry if appropriate.`,
    );
  }
  const output = collectOutput(result);
  if (result.code !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`);
  }
  return { command, args, output, code: result.code, outputCapped: false };
}
