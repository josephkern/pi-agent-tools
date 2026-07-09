import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreEnv } from "./helpers.mjs";

const originalTreeSitterBin = process.env.TREE_SITTER_BIN;
const originalNpmBin = process.env.NPM_BIN;
const originalManagedHome = process.env.PI_TREE_SITTER_CLI_HOME;

let testRoot;
let managedRoot;
let tools;

before(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "pi-tree-sitter-cli-test-"));
  managedRoot = join(testRoot, "managed");

  const treeSitterBin = join(testRoot, "tree-sitter-fake.mjs");
  const npmBin = join(testRoot, "npm-fake.mjs");

  await writeFile(
    treeSitterBin,
    String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args[0];

if (command === "dump-languages") {
  console.log('name: fake-typescript');
  console.log('scope: source.ts');
  process.exit(0);
}

if (command === "parse") {
  if (args.includes("--json-summary")) {
    console.log(JSON.stringify({ parse_summaries: [{ file: args.at(-1), successful: true }], source_count: 1 }, null, 2));
  } else {
    console.log('(program)');
  }
  process.exit(0);
}

if (command === "query") {
  if (args.includes("backtick-fixture.ts")) {
    // Mirror real output for captured text containing template literals: an
    // interior line ends with a backtick and another starts at column 0.
    const tick = String.fromCharCode(96);
    console.log('backtick-fixture.ts');
    console.log('    pattern:  0, capture: 0 - body, start: (0, 38), end: (4, 1), text: ' + tick + '{');
    console.log('  const s = ' + tick);
    console.log('hello ' + '$' + '{name}' + tick + ';');
    console.log('  return s;');
    console.log('}' + tick);
    console.log('    pattern:  0, capture: 0 - body, start: (6, 0), end: (6, 10), text: ' + tick + '{ done(); }' + tick);
    process.exit(0);
  }
  if (args.includes("compact-fixture.ts")) {
    // Mirror real tree-sitter query --captures output: a file header followed by indented capture rows.
    const tick = String.fromCharCode(96);
    console.log('compact-fixture.ts');
    console.log('    pattern:  0, capture: 0 - signature.name, start: (1, 9), end: (1, 12), text: ' + tick + 'foo' + tick);
    console.log('    pattern:  0, capture: 1 - signature.params, start: (1, 12), end: (3, 1), text: ' + tick + '(foo,');
    console.log('  bar');
    console.log(')' + tick);
    process.exit(0);
  }
  console.log('query ok');
  process.exit(0);
}

if (command === "tags") {
  // Mirror real tree-sitter tags output: single-file output has no file header;
  // multi-file output has a file header followed by indented tag rows.
  if (args.includes("multi-tags.ts")) {
    console.log('multi-tags.ts');
    console.log('    fake\t | function\tdef (0, 0) - (0, 4) fake');
    process.exit(0);
  }
  console.log('fake\t | function\tdef (0, 0) - (0, 4) fake');
  process.exit(0);
}

console.error('unexpected tree-sitter command: ' + args.join(' '));
process.exit(64);
`,
    "utf8",
  );
  await chmod(treeSitterBin, 0o755);

  await writeFile(
    npmBin,
    String.raw`#!/usr/bin/env node
console.log('fake npm ' + process.argv.slice(2).join(' '));
`,
    "utf8",
  );
  await chmod(npmBin, 0o755);

  process.env.TREE_SITTER_BIN = treeSitterBin;
  process.env.NPM_BIN = npmBin;
  process.env.PI_TREE_SITTER_CLI_HOME = managedRoot;

  const { default: treeSitterCliExtension } = await import(`../src/index.ts?test=${Date.now()}`);
  tools = new Map();
  treeSitterCliExtension({
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  });
});

after(async () => {
  restoreEnv("TREE_SITTER_BIN", originalTreeSitterBin);
  restoreEnv("NPM_BIN", originalNpmBin);
  restoreEnv("PI_TREE_SITTER_CLI_HOME", originalManagedHome);
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

function registeredTool(name) {
  const tool = tools.get(name);
  assert.ok(tool, `expected tool to be registered: ${name}`);
  return tool;
}

test("registers the expected Tree-sitter CLI tools", () => {
  assert.deepEqual([...tools.keys()], [
    "tree_sitter_languages",
    "tree_sitter_grammar_status",
    "tree_sitter_grammar_install",
    "tree_sitter_parse",
    "tree_sitter_query",
    "tree_sitter_tags",
  ]);
});

test("parse tool builds CLI arguments and formats output", async () => {
  const result = await registeredTool("tree_sitter_parse").execute(
    "test-call",
    {
      paths: ["fixture.ts"],
      mode: "json-summary",
      noRanges: true,
      processTimeoutMs: 1_000,
    },
    undefined,
  );

  assert.deepEqual(result.details.args, ["parse", "--json-summary", "--no-ranges", "--", "fixture.ts"]);
  assert.equal(result.details.exitCode, 0);
  assert.match(result.content[0].text, /## Tree-sitter parse/);
  assert.match(result.content[0].text, /"source_count": 1/);
});

test("tools reject invalid parameter combinations before spawning", async () => {
  await assert.rejects(
    () => registeredTool("tree_sitter_parse").execute("test-call", {}, undefined),
    /requires `paths` or `pathsFile`/,
  );

  await assert.rejects(
    () =>
      registeredTool("tree_sitter_query").execute(
        "test-call",
        { query: "(program) @root", queryFile: "query.scm", paths: ["fixture.ts"] },
        undefined,
      ),
    /requires exactly one of `query` or `queryFile`/,
  );
});

test("option-like positional values are passed after -- instead of as flags", async () => {
  const parseResult = await registeredTool("tree_sitter_parse").execute(
    "test-call",
    { paths: ["--stat"], processTimeoutMs: 1_000 },
    undefined,
  );
  assert.deepEqual(parseResult.details.args, ["parse", "--cst", "--", "--stat"]);

  const queryResult = await registeredTool("tree_sitter_query").execute(
    "test-call",
    { queryFile: "--fake-flag.scm", paths: ["fixture.ts"], processTimeoutMs: 1_000 },
    undefined,
  );
  const separator = queryResult.details.args.indexOf("--");
  assert.notEqual(separator, -1);
  assert.deepEqual(queryResult.details.args.slice(separator), ["--", "--fake-flag.scm", "fixture.ts"]);
});

test("grammar install rejects option-like package specs before spawning", async () => {
  await assert.rejects(
    () =>
      registeredTool("tree_sitter_grammar_install").execute(
        "test-call",
        { packages: ["--registry=https://evil.example"] },
        undefined,
      ),
    /packages entries must not start with "-"/,
  );
});

test("query tool supports inline queries and range arguments", async () => {
  const result = await registeredTool("tree_sitter_query").execute(
    "test-call",
    {
      query: "(program) @root",
      paths: ["fixture.ts"],
      captures: true,
      rowRange: "1:2",
      processTimeoutMs: 1_000,
    },
    undefined,
  );

  assert.equal(result.details.inlineQuery, true);
  assert.equal(result.details.exitCode, 0);
  assert.equal(result.details.args[0], "query");
  assert.ok(result.details.args.includes("--captures"));
  assert.ok(result.details.args.includes("--row-range"));
  assert.ok(result.details.args.includes("1:2"));
  assert.match(result.content[0].text, /query ok/);
});

test("query tool supports compact capture output", async () => {
  const result = await registeredTool("tree_sitter_query").execute(
    "test-call",
    {
      query: "(function_declaration name: (identifier) @signature.name)",
      paths: ["compact-fixture.ts"],
      captures: true,
      compact: true,
      processTimeoutMs: 1_000,
    },
    undefined,
  );

  assert.equal(result.details.compact, true);
  assert.match(result.content[0].text, /compact-fixture\.ts:2:10 signature\.name foo/);
  assert.match(result.content[0].text, /compact-fixture\.ts:2:13 signature\.params \(foo, bar\)/);
  assert.doesNotMatch(result.content[0].text, /pattern:/);
});

test("query tool compact output handles backticks inside multi-line captures", async () => {
  const result = await registeredTool("tree_sitter_query").execute(
    "test-call",
    {
      query: "(function_declaration body: (statement_block) @body)",
      paths: ["backtick-fixture.ts"],
      captures: true,
      compact: true,
      processTimeoutMs: 1_000,
    },
    undefined,
  );

  const text = result.content[0].text;
  assert.match(text, /backtick-fixture\.ts:1:39 body \{const s = /);
  assert.match(text, /backtick-fixture\.ts:7:1 body \{done\(\);\}/);
  // The column-0 text line must not be mistaken for a file header.
  assert.doesNotMatch(text, /^hello /m);
});

test("tags tool supports compact output", async () => {
  const result = await registeredTool("tree_sitter_tags").execute(
    "test-call",
    { paths: ["fixture.ts"], compact: true, processTimeoutMs: 1_000 },
    undefined,
  );

  assert.equal(result.details.compact, true);
  assert.match(result.content[0].text, /fixture\.ts:1:1 function\.def fake/);
  assert.doesNotMatch(result.content[0].text, /\| function\s+def/);
});

test("tags tool compact output resolves the file name from a single-entry pathsFile", async () => {
  const pathsFile = join(testRoot, "tags-paths.txt");
  await writeFile(pathsFile, "listed-fixture.ts\n", "utf8");

  const result = await registeredTool("tree_sitter_tags").execute(
    "test-call",
    { pathsFile, compact: true, processTimeoutMs: 1_000 },
    undefined,
  );

  assert.equal(result.details.compact, true);
  assert.match(result.content[0].text, /listed-fixture\.ts:1:1 function\.def fake/);
});

test("tags tool compact output keeps the paths entry as default file when pathsFile is also given", async () => {
  const pathsFile = join(testRoot, "extra-tags-paths.txt");
  await writeFile(pathsFile, "", "utf8");

  const result = await registeredTool("tree_sitter_tags").execute(
    "test-call",
    { paths: ["fixture.ts"], pathsFile, compact: true, processTimeoutMs: 1_000 },
    undefined,
  );

  assert.match(result.content[0].text, /fixture\.ts:1:1 function\.def fake/);
});

test("tags tool supports compact output with file headers", async () => {
  const result = await registeredTool("tree_sitter_tags").execute(
    "test-call",
    { paths: ["multi-tags.ts"], compact: true, processTimeoutMs: 1_000 },
    undefined,
  );

  assert.equal(result.details.compact, true);
  assert.match(result.content[0].text, /multi-tags\.ts:1:1 function\.def fake/);
});

test("grammar install writes managed config and defaults to ignore-scripts", async () => {
  const result = await registeredTool("tree_sitter_grammar_install").execute(
    "test-call",
    { packages: ["tree-sitter-fake"], processTimeoutMs: 1_000 },
    undefined,
  );

  const config = JSON.parse(await readFile(join(managedRoot, "config.json"), "utf8"));
  assert.deepEqual(config["parser-directories"], [join(managedRoot, "node_modules")]);
  assert.match(result.details.npmCommand, /--ignore-scripts/);
  assert.match(result.content[0].text, /Discovered languages:/);
});
