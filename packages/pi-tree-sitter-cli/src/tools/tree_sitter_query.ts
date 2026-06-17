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
  truncateToolOutput,
} from "../output.ts";
import { readString } from "../params.ts";
import { QueryParams } from "../schemas.ts";

interface QuerySource {
  queryPath: string;
  inline: boolean;
  cleanup(): Promise<void>;
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
    description: `Run raw Tree-sitter queries with the tree-sitter CLI. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_query — run raw Tree-sitter .scm queries with the CLI",
    promptGuidelines: [
      "Use tree_sitter_query after tree_sitter_parse has revealed the grammar node names for a file.",
      "Use inline query for short one-off patterns and queryFile for reusable or large .scm queries.",
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

        const text = result.output || "(no query matches)";
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
                exitNotice,
              ),
            },
          ],
          details: {
            command: formatInvocation(result.command, result.args),
            args: result.args,
            exitCode: result.code,
            inlineQuery: querySource.inline,
            truncation,
          },
        };
      } finally {
        await querySource.cleanup();
      }
    },
  });
}
