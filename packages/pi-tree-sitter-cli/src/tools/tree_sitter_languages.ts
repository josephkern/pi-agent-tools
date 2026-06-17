import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildLanguagesArgs } from "../cli-args.ts";
import type { ToolContext } from "../context.ts";
import { LanguageParams } from "../schemas.ts";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatInvocation,
  formatSize,
  truncateToolOutput,
  truncationNotice,
} from "../output.ts";

export function registerLanguagesTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({
    name: "tree_sitter_languages",
    label: "Tree-sitter Languages",
    description: `List languages known to the tree-sitter CLI. Supports system config, explicit configPath, or the tool-local managed config. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_languages — list parsers known to the tree-sitter CLI",
    promptGuidelines: [
      "Use tree_sitter_languages before parsing or querying a new language to verify Tree-sitter parser availability.",
      "Use tree_sitter_languages with useManagedConfig=true after tree_sitter_grammar_install to inspect tool-local grammar packages.",
      "If tree_sitter_languages reports that the Tree-sitter CLI is missing, ask the user to install tree-sitter-cli or set TREE_SITTER_BIN instead of trying parse/query/tag tools.",
    ],
    parameters: LanguageParams,

    async execute(_toolCallId, params, signal) {
      const { args, processTimeoutMs } = buildLanguagesArgs(params as Record<string, unknown>);
      const { command, output } = await ctx.runTreeSitter(args, signal, { processTimeoutMs });

      const text =
        output ||
        [
          "(no languages reported)",
          "",
          "The Tree-sitter CLI is installed, but it did not report any languages.",
          "Run `tree-sitter init-config`, add grammar repositories to `parser-directories`, then retry.",
        ].join("\n");
      const truncation = truncateToolOutput(text);

      return {
        content: [
          {
            type: "text" as const,
            text: `## Tree-sitter languages\n\n${truncation.content}${truncationNotice(truncation)}`,
          },
        ],
        details: {
          command: formatInvocation(command, args),
          args,
          truncation,
        },
      };
    },
  });
}
