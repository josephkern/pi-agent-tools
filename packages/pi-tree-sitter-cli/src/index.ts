import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createToolContext } from "./context.ts";
import { registerGrammarInstallTool } from "./tools/tree_sitter_grammar_install.ts";
import { registerGrammarStatusTool } from "./tools/tree_sitter_grammar_status.ts";
import { registerLanguagesTool } from "./tools/tree_sitter_languages.ts";
import { registerParseTool } from "./tools/tree_sitter_parse.ts";
import { registerQueryTool } from "./tools/tree_sitter_query.ts";
import { registerTagsTool } from "./tools/tree_sitter_tags.ts";

export default function treeSitterCliExtension(pi: ExtensionAPI): void {
  const ctx = createToolContext();

  registerLanguagesTool(pi, ctx);
  registerGrammarStatusTool(pi, ctx);
  registerGrammarInstallTool(pi, ctx);
  registerParseTool(pi, ctx);
  registerQueryTool(pi, ctx);
  registerTagsTool(pi, ctx);
}
