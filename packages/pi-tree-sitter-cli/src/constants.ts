export const DEFAULT_TREE_SITTER_BIN = "tree-sitter";
export const DEFAULT_NPM_BIN = "npm";
export const TREE_SITTER_BIN = process.env.TREE_SITTER_BIN?.trim() || DEFAULT_TREE_SITTER_BIN;
export const NPM_BIN = process.env.NPM_BIN?.trim() || DEFAULT_NPM_BIN;
export const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
export const DEFAULT_NPM_TIMEOUT_MS = 120_000;
export const MAX_PROCESS_TIMEOUT_MS = 600_000;
export const MAX_INLINE_QUERY_BYTES = 100_000;
// Hard cap on captured child output; generous headroom over the display
// truncation limits so compact post-processing still sees plenty of input.
export const MAX_OUTPUT_BUFFER_BYTES = 2 * 1024 * 1024;

export const MISSING_TREE_SITTER_CLI = `Tree-sitter CLI not found.

This package exposes an existing \`tree-sitter\` executable; it does not install or bundle Tree-sitter.

Install one of:
  npm install -g tree-sitter-cli
  cargo install tree-sitter-cli

Or set TREE_SITTER_BIN=/absolute/path/to/tree-sitter.`;

export const MISSING_NPM = `npm not found.

Managed grammar installation uses npm to install Tree-sitter grammar packages into a tool-local cache.

Install npm or set NPM_BIN=/absolute/path/to/npm.`;

export const PARSE_MODES = new Set(["cst", "xml", "dot", "json-summary"]);
export const ENCODINGS = new Set(["utf8", "utf16-le", "utf16-be"]);
