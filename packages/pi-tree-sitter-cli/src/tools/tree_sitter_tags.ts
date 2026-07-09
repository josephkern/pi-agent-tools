import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTagsArgs } from "../cli-args.ts";
import type { ToolContext } from "../context.ts";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatInvocation,
  formatResultText,
  formatSize,
  outputCappedNotice,
  truncateToolOutput,
} from "../output.ts";
import { TagsParams } from "../schemas.ts";

function compactTagsOutput(output: string, defaultFile?: string): string {
  const compactLines: string[] = [];
  let currentFile: string | undefined;

  for (const line of output.split(/\r?\n/)) {
    const tag = parseTagLine(line, currentFile, defaultFile);
    if (tag) {
      compactLines.push(tag);
      continue;
    }

    if (line.length > 0 && !/^\s/.test(line) && !line.includes("|")) currentFile = line;
  }

  return compactLines.length > 0 ? compactLines.join("\n") : "(no compact tags)";
}

function parseTagLine(
  line: string,
  currentFile: string | undefined,
  defaultFile: string | undefined,
): string | undefined {
  const file = currentFile ?? defaultFile;
  if (!file) return undefined;

  const tag = line
    .trim()
    .match(/^(.+?)\s*\|\s*(\S+)\s+(\S+)\s+\((\d+),\s*(\d+)\)\s+-\s+\((\d+),\s*(\d+)\)/);
  if (!tag) return undefined;

  const [, name, kind, role, rowText, columnText] = tag;
  const row = Number(rowText) + 1;
  const column = Number(columnText) + 1;
  return `${file}:${row}:${column} ${kind}.${role} ${name.trim()}`;
}

function hasGlobPattern(path: string): boolean {
  return /[*?[\]{}]/.test(path);
}

// Tree-sitter omits the file header when tagging a single file, so compact
// output needs the file name from the params: either the one `paths` entry or
// the sole entry of `pathsFile`. When the run actually covers multiple files,
// headers are present and override this default, so a single `paths` entry is
// a safe fallback even when `pathsFile` is also supplied.
async function defaultTagFile(params: Record<string, unknown>): Promise<string | undefined> {
  const paths = Array.isArray(params.paths) ? params.paths : [];
  const pathsFile = typeof params.pathsFile === "string" ? params.pathsFile : undefined;

  if (paths.length === 1) {
    const [path] = paths;
    if (typeof path !== "string" || hasGlobPattern(path)) return undefined;
    return path;
  }

  if (paths.length === 0 && pathsFile) {
    let entries: string[];
    try {
      entries = (await readFile(pathsFile, "utf8"))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return undefined;
    }
    if (entries.length === 1 && !hasGlobPattern(entries[0])) return entries[0];
  }

  return undefined;
}

export function registerTagsTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({
    name: "tree_sitter_tags",
    label: "Tree-sitter Tags",
    description: `Generate Tree-sitter code-navigation tags with the tree-sitter CLI. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_tags — generate definitions and references with the tree-sitter CLI",
    promptGuidelines: [
      "Use tree_sitter_tags when you need Tree-sitter's built-in definitions/references for languages with queries/tags.scm.",
      "Set compact=true when you need token-efficient file:line:column tag output instead of the raw Tree-sitter CLI format.",
      "If tree_sitter_tags returns no tags, fall back to tree_sitter_parse plus tree_sitter_query recipes instead of adding custom symbol helpers.",
      "tree_sitter_tags requires paths or pathsFile; do not call it with no input because stdin is disabled for agent tools.",
    ],
    parameters: TagsParams,

    async execute(_toolCallId, params, signal) {
      const rawParams = params as Record<string, unknown>;
      const { args, processTimeoutMs } = buildTagsArgs(rawParams);
      const result = await ctx.runTreeSitter(args, signal, {
        processTimeoutMs,
        throwOnNonZero: false,
      });

      const compact = rawParams.compact === true;
      const text = compact && result.code === 0
        ? compactTagsOutput(result.output, await defaultTagFile(rawParams))
        : result.output || "(no tags returned)";
      const truncation = truncateToolOutput(text);
      const exitNotice =
        result.code === 0
          ? ""
          : `\n\n[tree-sitter tags exited with code ${result.code}. This can indicate missing tags queries for the grammar, parser configuration problems, invalid arguments, or syntax errors; inspect the output above.]`;

      return {
        content: [
          {
            type: "text" as const,
            text: formatResultText(
              "Tree-sitter tags",
              result,
              truncation.content,
              truncation,
              `${outputCappedNotice(result)}${exitNotice}`,
            ),
          },
        ],
        details: {
          command: formatInvocation(result.command, result.args),
          args: result.args,
          exitCode: result.code,
          outputCapped: result.outputCapped,
          compact,
          truncation,
        },
      };
    },
  });
}
