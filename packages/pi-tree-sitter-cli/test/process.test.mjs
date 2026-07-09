import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalTreeSitterBin = process.env.TREE_SITTER_BIN;
const originalManagedHome = process.env.PI_TREE_SITTER_CLI_HOME;

let testRoot;
let runTreeSitter;

before(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "pi-tree-sitter-cli-process-test-"));

  const treeSitterBin = join(testRoot, "tree-sitter-stubborn.mjs");
  await writeFile(
    treeSitterBin,
    `#!/usr/bin/env node
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
    "utf8",
  );
  await chmod(treeSitterBin, 0o755);

  process.env.TREE_SITTER_BIN = treeSitterBin;
  process.env.PI_TREE_SITTER_CLI_HOME = join(testRoot, "managed");

  ({ runTreeSitter } = await import(`../src/process.ts?test=${Date.now()}`));
});

after(async () => {
  if (originalTreeSitterBin === undefined) delete process.env.TREE_SITTER_BIN;
  else process.env.TREE_SITTER_BIN = originalTreeSitterBin;
  if (originalManagedHome === undefined) delete process.env.PI_TREE_SITTER_CLI_HOME;
  else process.env.PI_TREE_SITTER_CLI_HOME = originalManagedHome;
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

test("timeout escalates to SIGKILL when the process ignores SIGTERM", { timeout: 15_000 }, async () => {
  await assert.rejects(
    runTreeSitter(["parse", "fixture.ts"], undefined, { processTimeoutMs: 250 }),
    /timed out or was cancelled/,
  );
});
