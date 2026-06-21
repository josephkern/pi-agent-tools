import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { GH_BIN, MISSING_GH_CLI } from "./constants.ts";
import { stripAnsi } from "./output.ts";
import type { GhRunResult } from "./types.ts";

interface CommandExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
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

async function resolveGhBin(): Promise<string> {
  if (commandHasPathSeparator(GH_BIN)) {
    if (await isExecutable(GH_BIN)) return GH_BIN;
    throw new Error(`${MISSING_GH_CLI}\n\nConfigured GH_BIN was: ${GH_BIN}`);
  }

  for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
    for (const name of executableNames(GH_BIN)) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }

  throw new Error(MISSING_GH_CLI);
}

function execCommand(
  command: string,
  args: string[],
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<CommandExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", kill);
      proc.removeListener("error", onError);
      proc.removeListener("close", onClose);
    };

    const kill = () => {
      if (killed) return;
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000);
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
      resolve({ stdout, stderr, code: code ?? 0, killed });
    };

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.once("error", onError);
    proc.once("close", onClose);

    if (signal?.aborted) kill();
    else signal?.addEventListener("abort", kill, { once: true });

    if (timeoutMs > 0) timeoutId = setTimeout(kill, timeoutMs);
  });
}

export async function runGh(
  args: string[],
  signal: AbortSignal | undefined,
  processTimeoutMs: number,
): Promise<GhRunResult> {
  const command = await resolveGhBin();
  const result = await execCommand(command, args, signal, processTimeoutMs);
  const output = stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.killed) throw new Error(`gh ${args.join(" ")} timed out or was cancelled.`);
  return { command, args, output, code: result.code };
}
