import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalGhBin = process.env.GH_BIN;

let testRoot;
let tools;

before(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "pi-gh-cli-test-"));
  const ghBin = join(testRoot, "gh-fake.mjs");

  await writeFile(
    ghBin,
    String.raw`#!/usr/bin/env node
const args = process.argv.slice(2);

if (args.join(" ") === "auth status") {
  // Mirror the human-readable shape of gh auth status output.
  console.log("github.com");
  console.log("  ✓ Logged in");
  process.exit(0);
}

if (args[0] === "issue" && args[1] === "list") {
  // Mirror gh issue list --json number,title,state: compact JSON array on stdout.
  console.log(JSON.stringify([{ number: 1, title: "Test issue", state: "OPEN" }]));
  process.exit(0);
}

if (args[0] === "fail") {
  console.error("gh failed intentionally");
  process.exit(2);
}

console.error("unexpected gh command: " + args.join(" "));
process.exit(64);
`,
    "utf8",
  );
  await chmod(ghBin, 0o755);

  process.env.GH_BIN = ghBin;

  const { default: ghCliExtension } = await import(`../src/index.ts?test=${Date.now()}`);
  tools = new Map();
  ghCliExtension({
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  });
});

after(async () => {
  if (originalGhBin === undefined) delete process.env.GH_BIN;
  else process.env.GH_BIN = originalGhBin;
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

function registeredTool(name) {
  const tool = tools.get(name);
  assert.ok(tool, `expected tool to be registered: ${name}`);
  return tool;
}

test("registers the gh_cli tool", () => {
  assert.deepEqual([...tools.keys()], ["gh_cli"]);
});

test("gh_cli builds args and formats successful output", async () => {
  const result = await registeredTool("gh_cli").execute(
    "test-call",
    { args: ["issue", "list", "--json", "number,title,state"], processTimeoutMs: 1_000 },
    undefined,
  );

  assert.deepEqual(result.details.args, ["issue", "list", "--json", "number,title,state"]);
  assert.equal(result.details.exitCode, 0);
  assert.match(result.content[0].text, /## GitHub CLI/);
  assert.match(result.content[0].text, /Test issue/);
});

test("gh_cli rejects missing args before spawning", async () => {
  await assert.rejects(
    () => registeredTool("gh_cli").execute("test-call", {}, undefined),
    /requires at least one argument/,
  );
});

test("gh_cli returns non-zero output for inspection", async () => {
  const result = await registeredTool("gh_cli").execute(
    "test-call",
    { args: ["fail"], processTimeoutMs: 1_000 },
    undefined,
  );

  assert.equal(result.details.exitCode, 2);
  assert.match(result.content[0].text, /gh failed intentionally/);
  assert.match(result.content[0].text, /exited with code 2/);
});
