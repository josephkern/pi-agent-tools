import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildTagsArgs } from "../cli-args.ts";
import type { ToolContext } from "../context.ts";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatInvocation,
  formatResultText,
  formatSize,
  truncateToolOutput,
} from "../output.ts";
import { TagsParams } from "../schemas.ts";

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
      "If tree_sitter_tags returns no tags, fall back to tree_sitter_parse plus tree_sitter_query recipes instead of adding custom symbol helpers.",
      "tree_sitter_tags requires paths or pathsFile; do not call it with no input because stdin is disabled for agent tools.",
    ],
    parameters: TagsParams,

    async execute(_toolCallId, params, signal) {
      const { args, processTimeoutMs } = buildTagsArgs(params as Record<string, unknown>);
      const result = await ctx.runTreeSitter(args, signal, {
        processTimeoutMs,
        throwOnNonZero: false,
      });

      const text = result.output || "(no tags returned)";
      const truncation = truncateToolOutput(text);
      const exitNotice =
        result.code === 0
          ? ""
          : `\n\n[tree-sitter tags exited with code ${result.code}. This can indicate missing tags queries for the grammar, parser configuration problems, invalid arguments, or syntax errors; inspect the output above.]`;

      return {
        content: [
          {
            type: "text" as const,
            text: formatResultText("Tree-sitter tags", result, truncation.content, truncation, exitNotice),
          },
        ],
        details: {
          command: formatInvocation(result.command, result.args),
          args: result.args,
          exitCode: result.code,
          truncation,
        },
      };
    },
  });
}
