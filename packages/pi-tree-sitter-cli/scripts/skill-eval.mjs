#!/usr/bin/env node
// Live skill eval: run natural tasks through pi with this package's tools and
// skills loaded, then score whether the agent actually used them.
//
// Requires a configured pi provider/model. Defaults target a local endpoint;
// override with:
//   PI_EVAL_MODEL_ARGS="--provider litellm --model my-model" npm run eval:skills
//   PI_EVAL_TASK_TIMEOUT_MS=900000   per-task timeout (default 600000)
//   PI_EVAL_LIMIT=1                  run only N tasks
//   PI_EVAL_OFFSET=1                 skip the first N tasks

import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelArgs = (process.env.PI_EVAL_MODEL_ARGS || "--provider litellm --model qwen3.6-35b-a3b-nvfp4").split(/\s+/);
const timeoutMs = Number(process.env.PI_EVAL_TASK_TIMEOUT_MS) || 600_000;
const limit = Number(process.env.PI_EVAL_LIMIT) || Infinity;
const offset = Number(process.env.PI_EVAL_OFFSET) || 0;

const TASKS = [
  "List the function signatures defined in src/output.ts.",
  "What does src/params.ts import, and what does it export?",
  "I just edited src/context.ts - check it for syntax errors.",
];

async function skillArgs() {
  const args = [];
  for (const entry of await readdir(join(packageRoot, "skills"), { withFileTypes: true })) {
    if (entry.isDirectory()) args.push("--skill", join(packageRoot, "skills", entry.name, "SKILL.md"));
  }
  return args;
}

function runPi(args) {
  return new Promise((resolvePromise) => {
    const child = execFile("pi", args, { cwd: packageRoot, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? "", error });
    });
    // pi waits for stdin EOF when stdin is a pipe; close it or every run hangs.
    child.stdin?.end();
  });
}

function score(events) {
  const metrics = { skillRead: false, treeSitterCalls: 0, recipeFileUsed: false, inlineQuery: false, rawFileRead: false, finalText: "" };
  for (const event of events) {
    if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
    for (const item of event.message.content ?? []) {
      if (item.type === "text" && item.text?.trim()) metrics.finalText = item.text;
      if (item.type !== "toolCall") continue;
      const args = JSON.stringify(item.arguments ?? {});
      if (item.name === "read") {
        if (args.includes("SKILL.md")) metrics.skillRead = true;
        else metrics.rawFileRead = true;
      }
      if (item.name?.startsWith("tree_sitter_")) metrics.treeSitterCalls += 1;
      if (item.name === "tree_sitter_query") {
        if (args.includes("queryFile")) metrics.recipeFileUsed = true;
        if (args.includes('"query"')) metrics.inlineQuery = true;
      }
    }
  }
  return metrics;
}

const baseArgs = [
  "-ne", "-e", packageRoot,
  ...(await skillArgs()),
  "--no-prompt-templates", "--no-context-files", "--no-session",
  "--tools", "read,tree_sitter_languages,tree_sitter_parse,tree_sitter_query,tree_sitter_tags",
  ...modelArgs,
  // No --system-prompt: pi drops tool promptGuidelines when one is set, and
  // the eval should measure the default prompt real users run with.
  "-p", "--mode", "json",
];

let failures = 0;
for (const task of TASKS.slice(offset, offset + limit)) {
  process.stdout.write(`\n=== ${task}\n`);
  const { stdout, error } = await runPi([...baseArgs, task]);
  if (error && !stdout) {
    console.log(error.killed ? `  TIMED OUT after ${timeoutMs}ms (raise PI_EVAL_TASK_TIMEOUT_MS)` : `  RUN FAILED: ${error.message}`);
    failures += 1;
    continue;
  }
  const events = stdout.split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const m = score(events);
  const usedTools = m.treeSitterCalls > 0;
  if (!usedTools) failures += 1;
  console.log(`  tree_sitter calls: ${m.treeSitterCalls}`);
  console.log(`  recipe file used:  ${m.recipeFileUsed}`);
  console.log(`  inline query:      ${m.inlineQuery}`);
  console.log(`  skill read:        ${m.skillRead}`);
  console.log(`  raw file read:     ${m.rawFileRead}`);
  console.log(`  verdict:           ${usedTools ? (m.recipeFileUsed ? "structural + recipes" : "structural, no recipes") : "DID NOT USE TOOLS"}`);
  console.log(`  answer: ${m.finalText.slice(0, 200).replace(/\n/g, " ")}`);
}

process.exit(failures > 0 ? 1 : 0);
