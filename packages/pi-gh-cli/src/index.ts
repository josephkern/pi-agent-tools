import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatInvocation, formatResultText, formatSize, truncateToolOutput } from "./output.ts";
import { readGhArgs } from "./params.ts";
import { runGh } from "./process.ts";
import { GhCliParams } from "./schemas.ts";

export default function ghCliExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gh_cli",
    label: "GitHub CLI",
    description: `Run the GitHub CLI (gh) with explicit arguments and capped output. Requires an existing gh executable on PATH or GH_BIN and an authenticated gh setup. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "gh_cli — run the GitHub CLI with capped output",
    promptGuidelines: [
      "Use gh_cli for GitHub facts and operations when the GitHub CLI is available; pass args without the leading `gh`.",
      "Prefer token-efficient gh output flags such as --json, --jq, --limit, and --repo.",
      "Use read-only gh commands for exploration, such as auth status, repo view, issue list/view, pr list/view, and run list/view.",
      "Ask the user before mutating GitHub state, such as issue create/edit/close, PR operations, release operations, or workflow dispatch.",
      "If authentication or repository context is unclear, run `gh auth status` or pass --repo owner/repo explicitly.",
    ],
    parameters: GhCliParams,

    async execute(_toolCallId, params, signal) {
      const { args, processTimeoutMs } = readGhArgs(params as Record<string, unknown>);
      const result = await runGh(args, signal, processTimeoutMs);
      const text = result.output || "(gh produced no output)";
      const truncation = truncateToolOutput(text);
      const exitNotice =
        result.code === 0
          ? ""
          : `\n\n[gh exited with code ${result.code}. Inspect the output above for errors, authentication problems, missing repository context, or invalid arguments.]`;

      return {
        content: [
          {
            type: "text" as const,
            text: formatResultText("GitHub CLI", result, truncation.content, truncation, exitNotice),
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
