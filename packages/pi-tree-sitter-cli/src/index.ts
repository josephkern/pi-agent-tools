import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_TREE_SITTER_BIN = "tree-sitter";
const TREE_SITTER_BIN = process.env.TREE_SITTER_BIN?.trim() || DEFAULT_TREE_SITTER_BIN;
const EMPTY_PARAMS = Type.Object({}, { additionalProperties: false });

const MISSING_TREE_SITTER_CLI = `Tree-sitter CLI not found.

This package exposes an existing \`tree-sitter\` executable; it does not install or bundle Tree-sitter.

Install one of:
  npm install -g tree-sitter-cli
  cargo install tree-sitter-cli

Or set TREE_SITTER_BIN=/absolute/path/to/tree-sitter.`;

function truncationNotice(truncation: ReturnType<typeof truncateHead>): string {
  if (!truncation.truncated) return "";
  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  return `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Omitted ${omittedLines} lines (${formatSize(
    omittedBytes,
  )}).]`;
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

async function resolveTreeSitterBin(): Promise<string> {
  if (commandHasPathSeparator(TREE_SITTER_BIN)) {
    if (await isExecutable(TREE_SITTER_BIN)) return TREE_SITTER_BIN;
    throw new Error(`${MISSING_TREE_SITTER_CLI}\n\nConfigured TREE_SITTER_BIN was: ${TREE_SITTER_BIN}`);
  }

  for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
    for (const name of executableNames(TREE_SITTER_BIN)) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }

  throw new Error(MISSING_TREE_SITTER_CLI);
}

async function runTreeSitter(
  pi: ExtensionAPI,
  args: string[],
  signal: AbortSignal | undefined,
): Promise<{ command: string; output: string }> {
  const command = await resolveTreeSitterBin();
  const result = await pi.exec(command, args, {
    signal,
    timeout: 10_000,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.code !== 0) {
    throw new Error(
      `tree-sitter ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`,
    );
  }

  return { command, output };
}

export default function treeSitterCliExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "tree_sitter_languages",
    label: "Tree-sitter Languages",
    description: `List languages known to the tree-sitter CLI. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_languages — list parsers known to the tree-sitter CLI",
    promptGuidelines: [
      "Use tree_sitter_languages before parsing or querying a new language to verify Tree-sitter parser availability.",
      "If tree_sitter_languages reports that the Tree-sitter CLI is missing, ask the user to install tree-sitter-cli or set TREE_SITTER_BIN instead of trying parse/query/tag tools.",
    ],
    parameters: EMPTY_PARAMS,

    async execute(_toolCallId, _params, signal) {
      const { command, output } = await runTreeSitter(pi, ["dump-languages"], signal);

      const text = output ||
        [
          "(no languages reported)",
          "",
          "The Tree-sitter CLI is installed, but it did not report any languages.",
          "Run `tree-sitter init-config`, add grammar repositories to `parser-directories`, then retry.",
        ].join("\n");
      const truncation = truncateHead(text, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `## Tree-sitter languages\n\n${truncation.content}${truncationNotice(truncation)}`,
          },
        ],
        details: {
          command: `${command} dump-languages`,
          truncation,
        },
      };
    },
  });
}
