import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_PROCESS_TIMEOUT_MS } from "../constants.ts";
import type { ToolContext } from "../context.ts";
import { formatInvocation, truncateToolOutput, truncationNotice } from "../output.ts";
import { readPositiveInteger } from "../params.ts";
import { GrammarStatusParams } from "../schemas.ts";

export function registerGrammarStatusTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({
    name: "tree_sitter_grammar_status",
    label: "Tree-sitter Grammar Status",
    description:
      "Show the tool-local Tree-sitter grammar cache, managed config path, installed npm grammar packages, and languages discovered through the managed config.",
    promptSnippet: "tree_sitter_grammar_status — inspect tool-local Tree-sitter grammar cache",
    promptGuidelines: [
      "Use tree_sitter_grammar_status before tree_sitter_grammar_install when you need to inspect the tool-local grammar cache.",
      "Use tree_sitter_grammar_status after tree_sitter_grammar_install to verify languages discovered by the managed config.",
      "If the user wants grammars available without useManagedConfig, tell them to install npm grammar packages globally, e.g. `npm install -g tree-sitter-typescript`, and verify with tree_sitter_languages.",
    ],
    parameters: GrammarStatusParams,

    async execute(_toolCallId, params, signal) {
      const root = ctx.managedRoot();
      const configPath = ctx.managedConfigPath();
      const nodeModulesPath = ctx.managedNodeModulesPath();
      const packageJsonPath = ctx.managedPackageJsonPath();
      const dependencies = await ctx.readManagedDependencies();
      const configExists = await ctx.fileExists(configPath);
      const packageJsonExists = await ctx.fileExists(packageJsonPath);
      const processTimeoutMs = readPositiveInteger(params as Record<string, unknown>, "processTimeoutMs") ??
        DEFAULT_PROCESS_TIMEOUT_MS;

      let languages = "(managed config missing; run tree_sitter_grammar_install first)";
      let dumpCommand: string | undefined;
      let dumpExitCode: number | undefined;
      if (configExists) {
        try {
          const result = await ctx.runTreeSitter(
            ["dump-languages", "--config-path", configPath],
            signal,
            { processTimeoutMs, throwOnNonZero: false },
          );
          languages = result.output || "(no languages reported by managed config)";
          dumpCommand = formatInvocation(result.command, result.args);
          dumpExitCode = result.code;
        } catch (error) {
          languages = error instanceof Error ? error.message : String(error);
        }
      }

      const dependencyLines = Object.entries(dependencies).map(([name, version]) => `- ${name}@${version}`);
      const body = [
        `Root: ${root}`,
        `Config: ${configPath} (${configExists ? "exists" : "missing"})`,
        `Package: ${packageJsonPath} (${packageJsonExists ? "exists" : "missing"})`,
        `Parser directory: ${nodeModulesPath}`,
        `Tree-sitter cache: ${join(root, "cache")}`,
        `npm cache: ${join(root, "npm-cache")}`,
        "",
        "Installed grammar packages:",
        dependencyLines.length > 0 ? dependencyLines.join("\n") : "(none)",
        "",
        "Discovered languages:",
        languages,
        "",
        "Default/global grammar note:",
        "Install npm grammar packages globally, e.g. `npm install -g tree-sitter-typescript`, when you want Tree-sitter's default config to discover them without useManagedConfig. Verify with tree_sitter_languages.",
      ].join("\n");
      const truncation = truncateToolOutput(body);

      return {
        content: [
          {
            type: "text" as const,
            text: `## Tree-sitter grammar status\n\n${truncation.content}${truncationNotice(truncation)}`,
          },
        ],
        details: {
          root,
          configPath,
          nodeModulesPath,
          treeSitterCachePath: join(root, "cache"),
          npmCachePath: join(root, "npm-cache"),
          packageJsonPath,
          packageJsonExists,
          configExists,
          dependencies,
          dumpCommand,
          dumpExitCode,
          truncation,
        },
      };
    },
  });
}
