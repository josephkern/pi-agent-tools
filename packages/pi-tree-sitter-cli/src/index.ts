import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_TREE_SITTER_BIN = "tree-sitter";
const DEFAULT_NPM_BIN = "npm";
const TREE_SITTER_BIN = process.env.TREE_SITTER_BIN?.trim() || DEFAULT_TREE_SITTER_BIN;
const NPM_BIN = process.env.NPM_BIN?.trim() || DEFAULT_NPM_BIN;
const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
const DEFAULT_NPM_TIMEOUT_MS = 120_000;
const MAX_INLINE_QUERY_BYTES = 100_000;

const PathInputs = {
  paths: Type.Optional(
    Type.Array(Type.String(), {
      description: "Source file paths or glob patterns passed to tree-sitter.",
      minItems: 1,
    }),
  ),
  pathsFile: Type.Optional(Type.String({ description: "Path to a file containing source paths." })),
} as const;

const ConfigInputs = {
  configPath: Type.Optional(Type.String({ description: "Path to a Tree-sitter config.json file." })),
  useManagedConfig: Type.Optional(
    Type.Boolean({ description: "Use this package's tool-local Tree-sitter config." }),
  ),
} as const;

const ProcessTimeoutInput = {
  processTimeoutMs: Type.Optional(
    Type.Number({ description: "Wrapper process timeout in milliseconds.", minimum: 1 }),
  ),
} as const;

const LanguageParams = Type.Object(
  {
    ...ConfigInputs,
    ...ProcessTimeoutInput,
  },
  { additionalProperties: false },
);

const GrammarStatusParams = Type.Object(
  {
    ...ProcessTimeoutInput,
  },
  { additionalProperties: false },
);

const GrammarInstallParams = Type.Object(
  {
    packages: Type.Array(Type.String({ description: "npm grammar package spec, e.g. tree-sitter-python." }), {
      description: "Tree-sitter grammar npm package specs to install into the tool-local cache.",
      minItems: 1,
    }),
    allowScripts: Type.Optional(
      Type.Boolean({
        description: "Allow npm lifecycle scripts. Defaults to false, which passes --ignore-scripts.",
      }),
    ),
    ...ProcessTimeoutInput,
  },
  { additionalProperties: false },
);

const CommonCliInputs = {
  ...ConfigInputs,
  scope: Type.Optional(
    Type.String({ description: "Language scope to use when file extension is ambiguous." }),
  ),
  grammarPath: Type.Optional(Type.String({ description: "Path to a Tree-sitter grammar directory." })),
  ...ProcessTimeoutInput,
} as const;

const ParseParams = Type.Object(
  {
    ...PathInputs,
    mode: Type.Optional(
      Type.String({ description: "Output mode: cst (default), xml, dot, or json-summary." }),
    ),
    ...CommonCliInputs,
    encoding: Type.Optional(
      Type.String({ description: "Input encoding: utf8, utf16-le, or utf16-be." }),
    ),
    timeoutMicros: Type.Optional(
      Type.Number({ description: "Tree-sitter per-file parse timeout in microseconds.", minimum: 1 }),
    ),
    stat: Type.Optional(Type.Boolean({ description: "Show parse statistics." })),
    time: Type.Optional(Type.Boolean({ description: "Measure parse time." })),
    noRanges: Type.Optional(Type.Boolean({ description: "Omit ranges in CST output." })),
  },
  { additionalProperties: false },
);

const QueryParams = Type.Object(
  {
    query: Type.Optional(Type.String({ description: "Inline Tree-sitter query text." })),
    queryFile: Type.Optional(Type.String({ description: "Path to a .scm Tree-sitter query file." })),
    ...PathInputs,
    ...CommonCliInputs,
    captures: Type.Optional(Type.Boolean({ description: "Order output by captures instead of matches." })),
    time: Type.Optional(Type.Boolean({ description: "Measure query execution time." })),
    byteRange: Type.Optional(
      Type.String({ description: "Byte range to query, formatted as start:end." }),
    ),
    rowRange: Type.Optional(Type.String({ description: "Row range to query, formatted as start:end." })),
    containingByteRange: Type.Optional(
      Type.String({
        description: "Byte range; only matches fully contained in this range are returned.",
      }),
    ),
    containingRowRange: Type.Optional(
      Type.String({
        description: "Row range; only matches fully contained in this range are returned.",
      }),
    ),
  },
  { additionalProperties: false },
);

const TagsParams = Type.Object(
  {
    ...PathInputs,
    ...CommonCliInputs,
    time: Type.Optional(Type.Boolean({ description: "Measure tag generation time." })),
  },
  { additionalProperties: false },
);

const MISSING_TREE_SITTER_CLI = `Tree-sitter CLI not found.

This package exposes an existing \`tree-sitter\` executable; it does not install or bundle Tree-sitter.

Install one of:
  npm install -g tree-sitter-cli
  cargo install tree-sitter-cli

Or set TREE_SITTER_BIN=/absolute/path/to/tree-sitter.`;

const MISSING_NPM = `npm not found.

Managed grammar installation uses npm to install Tree-sitter grammar packages into a tool-local cache.

Install npm or set NPM_BIN=/absolute/path/to/npm.`;

const PARSE_MODES = new Set(["cst", "xml", "dot", "json-summary"]);
const ENCODINGS = new Set(["utf8", "utf16-le", "utf16-be"]);

interface TreeSitterRunOptions {
  processTimeoutMs?: number;
  throwOnNonZero?: boolean;
}

interface CommandExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

interface TreeSitterRunResult {
  command: string;
  args: string[];
  output: string;
  code: number;
}

interface QuerySource {
  queryPath: string;
  inline: boolean;
  cleanup(): Promise<void>;
}

function truncationNotice(truncation: ReturnType<typeof truncateHead>): string {
  if (!truncation.truncated) return "";
  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  return `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Omitted ${omittedLines} lines (${formatSize(
    omittedBytes,
  )}).]`;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatInvocation(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}

function commandHasPathSeparator(command: string): boolean {
  return isAbsolute(command) || command.includes("/") || command.includes("\\");
}

function executableNames(command: string): string[] {
  if (process.platform !== "win32") return [command];

  const extensions = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  const lowerCommand = command.toLowerCase();
  const alreadyHasExtension = extensions.some((ext) => lowerCommand.endsWith(ext.toLowerCase()));
  return alreadyHasExtension ? [command] : [command, ...extensions.map((ext) => `${command}${ext}`)];
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(command: string, missingMessage: string, envName: string): Promise<string> {
  if (commandHasPathSeparator(command)) {
    if (await isExecutable(command)) return command;
    throw new Error(`${missingMessage}\n\nConfigured ${envName} was: ${command}`);
  }

  for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
    for (const name of executableNames(command)) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate)) return candidate;
    }
  }

  throw new Error(missingMessage);
}

async function resolveTreeSitterBin(): Promise<string> {
  return resolveExecutable(TREE_SITTER_BIN, MISSING_TREE_SITTER_CLI, "TREE_SITTER_BIN");
}

async function resolveNpmBin(): Promise<string> {
  return resolveExecutable(NPM_BIN, MISSING_NPM, "NPM_BIN");
}

async function execCommand(
  command: string,
  args: string[],
  signal: AbortSignal | undefined,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = {},
): Promise<CommandExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: { ...process.env, ...env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", kill);
      proc.removeListener("error", onError);
      proc.removeListener("close", onClose);
    };

    const kill = () => {
      if (killed) return;
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5_000);
    };

    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onClose = (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ stdout, stderr, code: code ?? 0, killed });
    };

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.once("error", onError);
    proc.once("close", onClose);

    if (signal?.aborted) kill();
    else signal?.addEventListener("abort", kill, { once: true });

    if (timeoutMs > 0) timeoutId = setTimeout(kill, timeoutMs);
  });
}

async function runTreeSitter(
  args: string[],
  signal: AbortSignal | undefined,
  options: TreeSitterRunOptions = {},
): Promise<TreeSitterRunResult> {
  const command = await resolveTreeSitterBin();
  const cacheRoot = join(managedRoot(), "cache");
  await mkdir(join(cacheRoot, "tree-sitter", "lock"), { recursive: true });
  const result = await execCommand(command, args, signal, options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS, {
    XDG_CACHE_HOME: cacheRoot,
  });

  const output = stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.killed) {
    throw new Error(`tree-sitter ${args.join(" ")} timed out or was cancelled.`);
  }
  if (options.throwOnNonZero !== false && result.code !== 0) {
    throw new Error(
      `tree-sitter ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`,
    );
  }

  return { command, args, output, code: result.code };
}

async function runNpm(
  args: string[],
  signal: AbortSignal | undefined,
  processTimeoutMs: number,
): Promise<TreeSitterRunResult> {
  const command = await resolveNpmBin();
  await mkdir(join(managedRoot(), "npm-cache"), { recursive: true });
  const result = await execCommand(command, args, signal, processTimeoutMs, {
    npm_config_cache: join(managedRoot(), "npm-cache"),
  });
  const output = stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.killed) throw new Error(`npm ${args.join(" ")} timed out or was cancelled.`);
  if (result.code !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with code ${result.code}: ${output || "no output"}`);
  }
  return { command, args, output, code: result.code };
}

function managedRoot(): string {
  return process.env.PI_TREE_SITTER_CLI_HOME?.trim() || join(homedir(), ".local", "share", "pi-tree-sitter-cli");
}

function managedNodeModulesPath(): string {
  return join(managedRoot(), "node_modules");
}

function managedPackageJsonPath(): string {
  return join(managedRoot(), "package.json");
}

function managedConfigPath(): string {
  return join(managedRoot(), "config.json");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureManagedPackageJson(): Promise<void> {
  const root = managedRoot();
  await mkdir(root, { recursive: true });
  const packageJsonPath = managedPackageJsonPath();
  if (await fileExists(packageJsonPath)) return;

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(
      {
        name: "pi-tree-sitter-cli-managed-grammars",
        private: true,
        description: "Tool-local Tree-sitter grammar cache for @josephakern/pi-tree-sitter-cli.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function writeManagedConfig(): Promise<string> {
  await mkdir(managedRoot(), { recursive: true });
  const configPath = managedConfigPath();
  await writeFile(
    configPath,
    `${JSON.stringify({ "parser-directories": [managedNodeModulesPath()] }, null, 2)}\n`,
    "utf8",
  );
  return configPath;
}

async function readManagedDependencies(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(managedPackageJsonPath(), "utf8");
    const parsed = JSON.parse(raw) as { dependencies?: unknown };
    if (!parsed.dependencies || typeof parsed.dependencies !== "object") return {};
    return parsed.dependencies as Record<string, string>;
  } catch {
    return {};
  }
}

function readString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function readStringArray(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings`);
  const values = value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${key} must contain only non-empty strings`);
    }
    return item;
  });
  return values;
}

function readPositiveInteger(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function readStringOption(
  params: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  fallback?: string,
): string | undefined {
  const value = readString(params, key) ?? fallback;
  if (value === undefined) return undefined;
  if (!allowed.has(value)) {
    throw new Error(`${key} must be one of: ${Array.from(allowed).join(", ")}`);
  }
  return value;
}

function readBoolean(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
  return value;
}

function readConfigPath(params: Record<string, unknown>): string | undefined {
  const configPath = readString(params, "configPath");
  const useManagedConfig = readBoolean(params, "useManagedConfig") === true;
  if (configPath && useManagedConfig) {
    throw new Error("Use either `configPath` or `useManagedConfig`, not both.");
  }
  return useManagedConfig ? managedConfigPath() : configPath;
}

function addConfigArg(args: string[], params: Record<string, unknown>): void {
  const configPath = readConfigPath(params);
  if (configPath) args.push("--config-path", configPath);
}

function readPathInputs(params: Record<string, unknown>, toolName: string): { paths: string[]; pathsFile?: string } {
  const paths = readStringArray(params, "paths");
  const pathsFile = readString(params, "pathsFile");
  if (paths.length === 0 && !pathsFile) {
    throw new Error(
      `${toolName} requires \`paths\` or \`pathsFile\`; stdin is disabled for agent tools.`,
    );
  }
  return { paths, pathsFile };
}

function addCommonCliArgs(args: string[], params: Record<string, unknown>): number {
  addConfigArg(args, params);
  const grammarPath = readString(params, "grammarPath");
  if (grammarPath) args.push("--grammar-path", grammarPath);
  const scope = readString(params, "scope");
  if (scope) args.push("--scope", scope);
  return readPositiveInteger(params, "processTimeoutMs") ?? DEFAULT_PROCESS_TIMEOUT_MS;
}

function buildLanguagesArgs(params: Record<string, unknown>): { args: string[]; processTimeoutMs: number } {
  const args = ["dump-languages"];
  addConfigArg(args, params);
  return {
    args,
    processTimeoutMs: readPositiveInteger(params, "processTimeoutMs") ?? DEFAULT_PROCESS_TIMEOUT_MS,
  };
}

function buildParseArgs(params: Record<string, unknown>): { args: string[]; processTimeoutMs: number } {
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

async function prepareQuerySource(params: Record<string, unknown>): Promise<QuerySource> {
  const query = readString(params, "query");
  const queryFile = readString(params, "queryFile");
  if ((query && queryFile) || (!query && !queryFile)) {
    throw new Error("tree_sitter_query requires exactly one of `query` or `queryFile`.");
  }

  if (queryFile) {
    return { queryPath: queryFile, inline: false, async cleanup() {} };
  }

  const queryText = query ?? "";
  const queryBytes = Buffer.byteLength(queryText, "utf8");
  if (queryBytes > MAX_INLINE_QUERY_BYTES) {
    throw new Error(
      `query exceeds maximum inline size of ${formatSize(MAX_INLINE_QUERY_BYTES)}; use queryFile instead.`,
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "pi-tree-sitter-query-"));
  const queryPath = join(tempDir, "query.scm");
  await writeFile(queryPath, queryText, "utf8");

  return {
    queryPath,
    inline: true,
    async cleanup() {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

function buildQueryArgs(
  params: Record<string, unknown>,
  queryPath: string,
): { args: string[]; processTimeoutMs: number } {
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

function buildTagsArgs(params: Record<string, unknown>): { args: string[]; processTimeoutMs: number } {
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

function buildGrammarInstallArgs(params: Record<string, unknown>): { args: string[]; processTimeoutMs: number } {
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

function formatResultText(
  title: string,
  result: TreeSitterRunResult,
  body: string,
  truncation: ReturnType<typeof truncateHead>,
  exitNotice = "",
): string {
  return [
    `## ${title}`,
    "",
    `Command: \`${formatInvocation(result.command, result.args)}\``,
    `Exit code: ${result.code}`,
    "",
    `${body}${truncationNotice(truncation)}${exitNotice}`,
  ].join("\n");
}

export default function treeSitterCliExtension(pi: ExtensionAPI) {
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
      const { command, output } = await runTreeSitter(args, signal, { processTimeoutMs });

      const text =
        output ||
        [
          "(no languages reported)",
          "",
          "The Tree-sitter CLI is installed, but it did not report any languages.",
          "Run `tree-sitter init-config`, add grammar repositories to `parser-directories`, then retry.",
        ].join("\n");
      const truncation = truncateHead(text, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

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

  pi.registerTool({
    name: "tree_sitter_grammar_status",
    label: "Tree-sitter Grammar Status",
    description:
      "Show the tool-local Tree-sitter grammar cache, managed config path, installed npm grammar packages, and languages discovered through the managed config.",
    promptSnippet: "tree_sitter_grammar_status — inspect tool-local Tree-sitter grammar cache",
    promptGuidelines: [
      "Use tree_sitter_grammar_status before tree_sitter_grammar_install when you need to inspect the tool-local grammar cache.",
      "Use tree_sitter_grammar_status after tree_sitter_grammar_install to verify languages discovered by the managed config.",
    ],
    parameters: GrammarStatusParams,

    async execute(_toolCallId, params, signal) {
      const root = managedRoot();
      const configPath = managedConfigPath();
      const nodeModulesPath = managedNodeModulesPath();
      const packageJsonPath = managedPackageJsonPath();
      const dependencies = await readManagedDependencies();
      const configExists = await fileExists(configPath);
      const packageJsonExists = await fileExists(packageJsonPath);
      const processTimeoutMs = readPositiveInteger(params as Record<string, unknown>, "processTimeoutMs") ??
        DEFAULT_PROCESS_TIMEOUT_MS;

      let languages = "(managed config missing; run tree_sitter_grammar_install first)";
      let dumpCommand: string | undefined;
      let dumpExitCode: number | undefined;
      if (configExists) {
        try {
          const result = await runTreeSitter(
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
      ].join("\n");
      const truncation = truncateHead(body, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

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

  pi.registerTool({
    name: "tree_sitter_grammar_install",
    label: "Tree-sitter Grammar Install",
    description:
      "Install Tree-sitter grammar npm packages into a tool-local cache and write a tool-local config.json. This mutates only the package-managed cache directory and does not edit global Tree-sitter config.",
    promptSnippet: "tree_sitter_grammar_install — install npm grammar packages into tool-local cache",
    promptGuidelines: [
      "Use tree_sitter_grammar_install only when the user explicitly asks to install grammar packages or approves parser acquisition.",
      "tree_sitter_grammar_install mutates the tool-local cache and runs npm; it never edits the user's global Tree-sitter config.",
      "By default tree_sitter_grammar_install passes --ignore-scripts. Set allowScripts=true only when the user accepts npm lifecycle script execution.",
    ],
    parameters: GrammarInstallParams,

    async execute(_toolCallId, params, signal) {
      await ensureManagedPackageJson();
      const configPath = await writeManagedConfig();
      const { args, processTimeoutMs } = buildGrammarInstallArgs(params as Record<string, unknown>);
      const installResult = await runNpm(args, signal, processTimeoutMs);
      await writeManagedConfig();

      let languages = "(language discovery skipped)";
      let dumpCommand: string | undefined;
      let dumpExitCode: number | undefined;
      try {
        const dumpResult = await runTreeSitter(
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

      const dependencies = await readManagedDependencies();
      const installOutput = installResult.output || "(npm produced no output)";
      const body = [
        `Root: ${managedRoot()}`,
        `Config: ${configPath}`,
        `Parser directory: ${managedNodeModulesPath()}`,
        `Tree-sitter cache: ${join(managedRoot(), "cache")}`,
        `npm cache: ${join(managedRoot(), "npm-cache")}`,
        `npm command: ${formatInvocation(installResult.command, installResult.args)}`,
        "",
        "npm output:",
        installOutput,
        "",
        "Discovered languages:",
        languages,
      ].join("\n");
      const truncation = truncateHead(body, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `## Tree-sitter grammar install\n\n${truncation.content}${truncationNotice(truncation)}`,
          },
        ],
        details: {
          root: managedRoot(),
          configPath,
          nodeModulesPath: managedNodeModulesPath(),
          treeSitterCachePath: join(managedRoot(), "cache"),
          npmCachePath: join(managedRoot(), "npm-cache"),
          npmCommand: formatInvocation(installResult.command, installResult.args),
          dependencies,
          dumpCommand,
          dumpExitCode,
          truncation,
        },
      };
    },
  });

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
      const result = await runTreeSitter(args, signal, {
        processTimeoutMs,
        throwOnNonZero: false,
      });

      const text = result.output || "(no parse output)";
      const truncation = truncateHead(text, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });
      const exitNotice =
        result.code === 0
          ? ""
          : `\n\n[tree-sitter parse exited with code ${result.code}. This can indicate syntax errors, parser configuration problems, or invalid arguments; inspect the output above.]`;

      return {
        content: [
          {
            type: "text" as const,
            text: formatResultText("Tree-sitter parse", result, truncation.content, truncation, exitNotice),
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

  pi.registerTool({
    name: "tree_sitter_query",
    label: "Tree-sitter Query",
    description: `Run raw Tree-sitter queries with the tree-sitter CLI. Requires an existing tree-sitter executable on PATH or TREE_SITTER_BIN; this package does not install Tree-sitter. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(
      DEFAULT_MAX_BYTES,
    )}, whichever is hit first.`,
    promptSnippet: "tree_sitter_query — run raw Tree-sitter .scm queries with the CLI",
    promptGuidelines: [
      "Use tree_sitter_query after tree_sitter_parse has revealed the grammar node names for a file.",
      "Use inline query for short one-off patterns and queryFile for reusable or large .scm queries.",
      "Use rowRange or containingRowRange with tree_sitter_query to restrict structural searches instead of adding custom helper tools.",
    ],
    parameters: QueryParams,

    async execute(_toolCallId, params, signal) {
      const querySource = await prepareQuerySource(params as Record<string, unknown>);
      try {
        const { args, processTimeoutMs } = buildQueryArgs(
          params as Record<string, unknown>,
          querySource.queryPath,
        );
        const result = await runTreeSitter(args, signal, {
          processTimeoutMs,
          throwOnNonZero: false,
        });

        const text = result.output || "(no query matches)";
        const truncation = truncateHead(text, {
          maxLines: DEFAULT_MAX_LINES,
          maxBytes: DEFAULT_MAX_BYTES,
        });
        const exitNotice =
          result.code === 0
            ? ""
            : `\n\n[tree-sitter query exited with code ${result.code}. This can indicate an invalid query, parser configuration problems, invalid arguments, or syntax errors; inspect the output above.]`;

        return {
          content: [
            {
              type: "text" as const,
              text: formatResultText(
                "Tree-sitter query",
                result,
                truncation.content,
                truncation,
                exitNotice,
              ),
            },
          ],
          details: {
            command: formatInvocation(result.command, result.args),
            args: result.args,
            exitCode: result.code,
            inlineQuery: querySource.inline,
            truncation,
          },
        };
      } finally {
        await querySource.cleanup();
      }
    },
  });

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
      const result = await runTreeSitter(args, signal, {
        processTimeoutMs,
        throwOnNonZero: false,
      });

      const text = result.output || "(no tags returned)";
      const truncation = truncateHead(text, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });
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
