import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreEnv } from "./helpers.mjs";

const originalTreeSitterBin = process.env.TREE_SITTER_BIN;
const originalManagedHome = process.env.PI_TREE_SITTER_CLI_HOME;
const originalGrandchildPidFile = process.env.GRANDCHILD_PID_FILE;

let testRoot;
let runTreeSitter;

before(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "pi-tree-sitter-cli-process-test-"));

  const treeSitterBin = join(testRoot, "tree-sitter-fake.mjs");
  await writeFile(
    treeSitterBin,
    String.raw`#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);

if (args.includes("stubborn.ts")) {
  // Ignore SIGTERM and keep a grandchild running to exercise group signaling.
  process.on("SIGTERM", () => {});
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(process.env.GRANDCHILD_PID_FILE, String(child.pid));
  setInterval(() => {}, 1000);
} else if (args.includes("leaky.ts")) {
  // Die on SIGTERM ourselves, but leave behind a grandchild that traps it;
  // only the post-close SIGKILL group sweep can reap it.
  const child = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    { stdio: "ignore" },
  );
  writeFileSync(process.env.GRANDCHILD_PID_FILE, String(child.pid));
  setInterval(() => {}, 1000);
} else if (args.includes("spew.ts")) {
  // Emit output forever; only the wrapper's output cap can stop this.
  const chunk = "x".repeat(64 * 1024);
  setInterval(() => process.stdout.write(chunk), 1);
} else {
  console.error("unexpected tree-sitter invocation: " + args.join(" "));
  process.exit(64);
}
`,
    "utf8",
  );
  await chmod(treeSitterBin, 0o755);

  process.env.TREE_SITTER_BIN = treeSitterBin;
  process.env.PI_TREE_SITTER_CLI_HOME = join(testRoot, "managed");

  ({ runTreeSitter } = await import(`../src/process.ts?test=${Date.now()}`));
});

after(async () => {
  restoreEnv("TREE_SITTER_BIN", originalTreeSitterBin);
  restoreEnv("PI_TREE_SITTER_CLI_HOME", originalManagedHome);
  restoreEnv("GRANDCHILD_PID_FILE", originalGrandchildPidFile);
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test("quoteForCmdShell quotes only values cmd.exe would misparse", async () => {
  const { quoteForCmdShell } = await import(`../src/process.ts?quote-test=${Date.now()}`);
  assert.equal(quoteForCmdShell("C:\\tools\\npm.cmd"), "C:\\tools\\npm.cmd");
  assert.equal(quoteForCmdShell("tree-sitter-python"), "tree-sitter-python");
  assert.equal(quoteForCmdShell("C:\\Program Files\\npm.cmd"), '"C:\\Program Files\\npm.cmd"');
  assert.equal(quoteForCmdShell('say "hi" & del'), '"say ""hi"" & del"');
});

test("timeout escalates to SIGKILL and signals the whole process group", { timeout: 15_000 }, async () => {
  const pidFile = join(testRoot, "grandchild.pid");
  process.env.GRANDCHILD_PID_FILE = pidFile;

  await assert.rejects(
    runTreeSitter(["parse", "stubborn.ts"], undefined, { processTimeoutMs: 500 }),
    /timed out or was cancelled/,
  );

  const grandchildPid = Number(await readFile(pidFile, "utf8"));
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0, "grandchild pid should be recorded");
  assert.ok(await waitForExit(grandchildPid, 3_000), "grandchild should be killed with the process group");
});

test("a grandchild that traps SIGTERM is swept by the post-close SIGKILL escalation", { timeout: 15_000 }, async () => {
  const pidFile = join(testRoot, "leaky-grandchild.pid");
  process.env.GRANDCHILD_PID_FILE = pidFile;

  await assert.rejects(
    runTreeSitter(["parse", "leaky.ts"], undefined, { processTimeoutMs: 500 }),
    /timed out or was cancelled/,
  );

  const grandchildPid = Number(await readFile(pidFile, "utf8"));
  assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0, "grandchild pid should be recorded");
  // The direct child dies to SIGTERM immediately; the trapping grandchild
  // must still be gone once the 5s SIGKILL group sweep has fired.
  assert.ok(await waitForExit(grandchildPid, 8_000), "grandchild should be SIGKILLed after close");
});

test("terminates the process and keeps a capped prefix when output exceeds the buffer cap", { timeout: 20_000 }, async () => {
  const result = await runTreeSitter(["parse", "spew.ts"], undefined, { processTimeoutMs: 15_000 });

  assert.equal(result.outputCapped, true);
  assert.doesNotMatch(result.output, /Output exceeded/);
  const bytes = Buffer.byteLength(result.output, "utf8");
  assert.ok(bytes > 1024 * 1024 && bytes < 4 * 1024 * 1024, "captured output should stay near the cap");
});
