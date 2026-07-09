import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildParseArgs } from "../cli-args.ts";
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
import { ParseParams } from "../schemas.ts";

export function registerParseTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({
    name: "tree_sitter_parse",
    label: "Tree-sitter Parse",
    description: `Parse files with the tree-sitter CLI. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_parse — inspect parse trees and parse status with the tree-sitter CLI",
    promptGuidelines: [
      "Use tree_sitter_parse to discover grammar node names before writing tree_sitter_query patterns.",
      "Use tree_sitter_parse with mode=json-summary when you only need parse success, timing, or syntax-error status.",
      "tree_sitter_parse requires paths or pathsFile; do not call it with no input because stdin parsing is disabled for agent tools.",
    ],
    parameters: ParseParams,

    async execute(_toolCallId, params, signal) {
      const { args, processTimeoutMs } = buildParseArgs(params as Record<string, unknown>);
      const result = await ctx.runTreeSitter(args, signal, {
        processTimeoutMs,
        throwOnNonZero: false,
      });

      const text = result.output || "(no parse output)";
      const truncation = truncateToolOutput(text);
      const exitNotice =
        result.code === 0
          ? ""
          : `\n\n[tree-sitter parse exited with code ${result.code}. This can indicate syntax errors, parser configuration problems, or invalid arguments; inspect the output above.]`;

      return {
        content: [
          {
            type: "text" as const,
            text: formatResultText(
              "Tree-sitter parse",
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
          truncation,
        },
      };
    },
  });
}
