import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  console.log('query ok');
  process.exit(0);
}

if (command === "tags") {
  console.log('fixture.ts\tfake | function def (0, 0) - (0, 4) fake');
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

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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

  assert.deepEqual(result.details.args, ["parse", "--json-summary", "--no-ranges", "fixture.ts"]);
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
