import {
  DEFAULT_NPM_TIMEOUT_MS,
  DEFAULT_PROCESS_TIMEOUT_MS,
  ENCODINGS,
  PARSE_MODES,
} from "./constants.ts";
import { managedRoot } from "./managed-grammar-cache.ts";
import {
  addCommonCliArgs,
  addConfigArg,
  readBoolean,
  readPathInputs,
  readPositiveInteger,
  readString,
  readStringArray,
  readStringOption,
} from "./params.ts";

export interface CliArgsResult {
  args: string[];
  processTimeoutMs: number;
}

export function buildLanguagesArgs(params: Record<string, unknown>): CliArgsResult {
  const args = ["dump-languages"];
  addConfigArg(args, params);
  return {
    args,
    processTimeoutMs: readPositiveInteger(params, "processTimeoutMs") ?? DEFAULT_PROCESS_TIMEOUT_MS,
  };
}

export function buildParseArgs(params: Record<string, unknown>): CliArgsResult {
  const { paths, pathsFile } = readPathInputs(params, "tree_sitter_parse");
  const mode = readStringOption(params, "mode", PARSE_MODES, "cst");
  const encoding = readStringOption(params, "encoding", ENCODINGS);
  const timeoutMicros = readPositiveInteger(params, "timeoutMicros");

  const args = ["parse"];
  const processTimeoutMs = addCommonCliArgs(args, params);

  if (mode === "cst") args.push("--cst");
  if (mode === "xml") args.push("--xml");
  if (mode === "dot") args.push("--dot");
  if (mode === "json-summary") args.push("--json-summary");

  if (encoding) args.push("--encoding", encoding);
  if (timeoutMicros !== undefined) args.push("--timeout", String(timeoutMicros));
  if (params.stat === true) args.push("--stat");
  if (params.time === true) args.push("--time");
  if (params.noRanges === true) args.push("--no-ranges");
  if (pathsFile) args.push("--paths", pathsFile);
  args.push(...paths);

  return { args, processTimeoutMs };
}

export function buildQueryArgs(
  params: Record<string, unknown>,
  queryPath: string,
): CliArgsResult {
  const { paths, pathsFile } = readPathInputs(params, "tree_sitter_query");
  const args = ["query"];
  const processTimeoutMs = addCommonCliArgs(args, params);

  if (params.captures === true) args.push("--captures");
  if (params.time === true) args.push("--time");

  const byteRange = readString(params, "byteRange");
  if (byteRange) args.push("--byte-range", byteRange);
  const rowRange = readString(params, "rowRange");
  if (rowRange) args.push("--row-range", rowRange);
  const containingByteRange = readString(params, "containingByteRange");
  if (containingByteRange) args.push("--containing-byte-range", containingByteRange);
  const containingRowRange = readString(params, "containingRowRange");
  if (containingRowRange) args.push("--containing-row-range", containingRowRange);

  if (pathsFile) args.push("--paths", pathsFile);
  args.push(queryPath, ...paths);

  return { args, processTimeoutMs };
}

export function buildTagsArgs(params: Record<string, unknown>): CliArgsResult {
  const { paths, pathsFile } = readPathInputs(params, "tree_sitter_tags");
  const args = ["tags"];
  const processTimeoutMs = addCommonCliArgs(args, params);

  if (params.time === true) args.push("--time");
  if (pathsFile) args.push("--paths", pathsFile);
  args.push(...paths);

  return { args, processTimeoutMs };
}

function readInstallPackages(params: Record<string, unknown>): string[] {
  const packages = readStringArray(params, "packages");
  if (packages.length === 0) throw new Error("tree_sitter_grammar_install requires at least one package.");
  return packages;
}

export function buildGrammarInstallArgs(params: Record<string, unknown>): CliArgsResult {
  const packages = readInstallPackages(params);
  const allowScripts = readBoolean(params, "allowScripts") === true;
  const args = [
    "install",
    "--prefix",
    managedRoot(),
    "--save-exact",
    "--no-audit",
    "--no-fund",
    "--install-strategy=nested",
  ];
  if (!allowScripts) args.push("--ignore-scripts");
  args.push(...packages);
  return {
    args,
    processTimeoutMs: readPositiveInteger(params, "processTimeoutMs") ?? DEFAULT_NPM_TIMEOUT_MS,
  };
}
