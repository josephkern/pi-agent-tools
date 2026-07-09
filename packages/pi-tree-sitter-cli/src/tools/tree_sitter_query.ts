import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildQueryArgs } from "../cli-args.ts";
import { MAX_INLINE_QUERY_BYTES } from "../constants.ts";
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
import { readString } from "../params.ts";
import { QueryParams } from "../schemas.ts";

interface QuerySource {
  queryPath: string;
  inline: boolean;
  cleanup(): Promise<void>;
}

function compactCaptureText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:)\]>}])/g, "$1")
    .replace(/([([{<])\s+/g, "$1")
    .trim();
}

function compactQueryOutput(output: string): string {
  const lines = output.split(/\r?\n/);
  const compactLines: string[] = [];
  let currentFile: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.length > 0 && !/^\s/.test(line)) {
      currentFile = line;
      continue;
    }

    const capture = line.match(
      /^\s*(?:pattern:\s*\d+,\s*)?capture:\s*\d+\s*-\s*([^,]+),\s*start:\s*\((\d+),\s*(\d+)\),\s*end:\s*\((\d+),\s*(\d+)\),\s*text:\s*`(.*)$/,
    );
    if (!capture || !currentFile) continue;

    const [, name, rowText, columnText, endRowText, , firstTextPart] = capture;
    // The record's coordinates say exactly how many lines the text spans, so
    // consume that many; backticks inside the captured text are not delimiters.
    const continuationLines = Math.max(0, Number(endRowText) - Number(rowText));
    const textParts = [firstTextPart ?? ""];
    for (let extra = 0; extra < continuationLines && index + 1 < lines.length; extra += 1) {
      index += 1;
      textParts.push(lines[index] ?? "");
    }

    const finalPart = textParts[textParts.length - 1];
    if (finalPart !== undefined && finalPart.endsWith("`")) {
      textParts[textParts.length - 1] = finalPart.slice(0, -1);
    }

    const row = Number(rowText) + 1;
    const column = Number(columnText) + 1;
    compactLines.push(`${currentFile}:${row}:${column} ${name} ${compactCaptureText(textParts.join("\n"))}`);
  }

  return compactLines.length > 0 ? compactLines.join("\n") : "(no query captures)";
}

async function prepareQuerySource(params: Record<string, unknown>): Promise<QuerySource> {
  const query = readString(params, "query");
  const queryFile = readString(params, "queryFile");
  if ((query && queryFile) || (!query && !queryFile)) {
    throw new Error("tree_sitter_query requires exactly one of `query` or `queryFile`.");
  }

  if (queryFile) {
    return { queryPath: queryFile, inline: false, async cleanup() {} };
  }

  const queryText = query ?? "";
  const queryBytes = Buffer.byteLength(queryText, "utf8");
  if (queryBytes > MAX_INLINE_QUERY_BYTES) {
    throw new Error(
      `query exceeds maximum inline size of ${formatSize(MAX_INLINE_QUERY_BYTES)}; use queryFile instead.`,
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "pi-tree-sitter-query-"));
  const queryPath = join(tempDir, "query.scm");
  await writeFile(queryPath, queryText, "utf8");

  return {
    queryPath,
    inline: true,
    async cleanup() {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export function registerQueryTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({
    name: "tree_sitter_query",
    label: "Tree-sitter Query",
    description: `Run raw Tree-sitter queries with the tree-sitter CLI. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Shipped recipe .scm files (imports, exports, function signatures, type declarations, syntax errors) live under ${ctx.recipesRoot()}/<language>/<task>.scm for languages typescript, javascript, python, universal; prefer them via queryFile when one fits. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_query — run raw Tree-sitter .scm queries with the CLI",
    promptGuidelines: [
      "Use tree_sitter_query after tree_sitter_parse has revealed the grammar node names for a file.",
      "Use inline query for short one-off patterns and queryFile for reusable or large .scm queries.",
      `Shipped recipe .scm files for imports, exports, function signatures, type declarations, and syntax errors live under ${ctx.recipesRoot()}/<language>/<task>.scm (languages: typescript, javascript, python, universal); prefer them over hand-written queries when one fits.`,
      "Set compact=true when you need token-efficient capture output instead of the raw Tree-sitter CLI format.",
      "Use rowRange or containingRowRange with tree_sitter_query to restrict structural searches instead of adding custom helper tools.",
    ],
    parameters: QueryParams,

    async execute(_toolCallId, params, signal) {
      const querySource = await prepareQuerySource(params as Record<string, unknown>);
      try {
        const { args, processTimeoutMs } = buildQueryArgs(
          params as Record<string, unknown>,
          querySource.queryPath,
        );
        const result = await ctx.runTreeSitter(args, signal, {
          processTimeoutMs,
          throwOnNonZero: false,
        });

        const compact = (params as Record<string, unknown>).compact === true;
        const text = compact && result.code === 0 ? compactQueryOutput(result.output) : result.output || "(no query matches)";
        const truncation = truncateToolOutput(text);
        const exitNotice =
          result.code === 0
            ? ""
            : `\n\n[tree-sitter query exited with code ${result.code}. This can indicate an invalid query, parser configuration problems, invalid arguments, or syntax errors; inspect the output above.]`;

        return {
          content: [
            {
              type: "text" as const,
              text: formatResultText(
                "Tree-sitter query",
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
            inlineQuery: querySource.inline,
            compact,
            truncation,
          },
        };
      } finally {
        await querySource.cleanup();
      }
    },
  });
}
