export const DEFAULT_GH_BIN = "gh";
export const GH_BIN = process.env.GH_BIN?.trim() || DEFAULT_GH_BIN;
export const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;

export const MISSING_GH_CLI = `GitHub CLI not found.

This package exposes an existing \`gh\` executable; it does not install or bundle GitHub CLI.

Install GitHub CLI from https://cli.github.com/ or set GH_BIN=/absolute/path/to/gh.`;
