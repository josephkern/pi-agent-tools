import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildGrammarInstallArgs } from "../cli-args.ts";
import { DEFAULT_PROCESS_TIMEOUT_MS } from "../constants.ts";
import type { ToolContext } from "../context.ts";
import { formatInvocation, truncateToolOutput, truncationNotice } from "../output.ts";
import { GrammarInstallParams } from "../schemas.ts";

export function registerGrammarInstallTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({
    name: "tree_sitter_grammar_install",
    label: "Tree-sitter Grammar Install",
    description:
      "Install Tree-sitter grammar npm packages into a tool-local cache and write a tool-local config.json. This mutates only the package-managed cache directory and does not edit global Tree-sitter config.",
    promptSnippet: "tree_sitter_grammar_install — install npm grammar packages into tool-local cache",
    promptGuidelines: [
      "Use tree_sitter_grammar_install only when the user explicitly asks to install grammar packages or approves parser acquisition.",
      "tree_sitter_grammar_install mutates the tool-local cache and runs npm; it never edits the user's global Tree-sitter config.",
      "Grammars installed by this tool require useManagedConfig=true in tree_sitter_languages, parse, query, and tags; for Python-style default availability, tell the user to use npm install -g tree-sitter-<language> instead.",
      "By default tree_sitter_grammar_install passes --ignore-scripts. Set allowScripts=true only when the user accepts npm lifecycle script execution.",
    ],
    parameters: GrammarInstallParams,

    async execute(_toolCallId, params, signal) {
      await ctx.ensureManagedPackageJson();
      const configPath = await ctx.writeManagedConfig();
      const { args, processTimeoutMs } = buildGrammarInstallArgs(params as Record<string, unknown>);
      const installResult = await ctx.runNpm(args, signal, processTimeoutMs);
      await ctx.writeManagedConfig();

      let languages = "(language discovery skipped)";
      let dumpCommand: string | undefined;
      let dumpExitCode: number | undefined;
      try {
        const dumpResult = await ctx.runTreeSitter(
          ["dump-languages", "--config-path", configPath],
          signal,
          { processTimeoutMs: DEFAULT_PROCESS_TIMEOUT_MS, throwOnNonZero: false },
        );
        languages = dumpResult.output || "(no languages reported by managed config)";
        dumpCommand = formatInvocation(dumpResult.command, dumpResult.args);
        dumpExitCode = dumpResult.code;
      } catch (error) {
        languages = error instanceof Error ? error.message : String(error);
      }

      const dependencies = await ctx.readManagedDependencies();
      const installOutput = installResult.output || "(npm produced no output)";
      const root = ctx.managedRoot();
      const body = [
        `Root: ${root}`,
        `Config: ${configPath}`,
        `Parser directory: ${ctx.managedNodeModulesPath()}`,
        `Tree-sitter cache: ${join(root, "cache")}`,
        `npm cache: ${join(root, "npm-cache")}`,
        `npm command: ${formatInvocation(installResult.command, installResult.args)}`,
        "",
        "npm output:",
        installOutput,
        "",
        "Discovered languages:",
        languages,
      ].join("\n");
      const truncation = truncateToolOutput(body);

      return {
        content: [
          {
            type: "text" as const,
            text: `## Tree-sitter grammar install\n\n${truncation.content}${truncationNotice(truncation)}`,
          },
        ],
        details: {
          root,
          configPath,
          nodeModulesPath: ctx.managedNodeModulesPath(),
          treeSitterCachePath: join(root, "cache"),
          npmCachePath: join(root, "npm-cache"),
          npmCommand: formatInvocation(installResult.command, installResult.args),
          dependencies,
          dumpCommand,
          dumpExitCode,
          truncation,
        },
      };
    },
  });
}
