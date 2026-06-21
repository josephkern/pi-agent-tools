import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const treeSitterBin = process.env.TREE_SITTER_BIN || "tree-sitter";

async function runTreeSitter(args) {
  return execFileAsync(treeSitterBin, args, { timeout: 10_000, maxBuffer: 1024 * 1024 });
}

async function hasPythonParser() {
  try {
    const { stdout, stderr } = await runTreeSitter(["dump-languages"]);
    const output = `${stdout}\n${stderr}`;
    return /scope:\s*source\.python\b/.test(output) || /name:\s*python\b/.test(output);
  } catch {
    return false;
  }
}

test("python query recipes match a representative fixture when parser is available", async () => {
  if (!(await hasPythonParser())) return;

  const tempRoot = await mkdtemp(join(tmpdir(), "pi-tree-sitter-recipes-"));
  const fixturePath = join(tempRoot, "fixture.py");
  await writeFile(
    fixturePath,
    [
      "import os",
      "import sys as system",
      "from pathlib import Path",
      "from typing import Any as AnyType, Optional",
      "from os.path import *",
      "",
      "__all__ = [\"Foo\", \"make_foo\", \"VALUE\"]",
      "VALUE = 1",
      "type UserId = int",
      "",
      "class Foo(Base):",
      "    def method(self):",
      "        pass",
      "",
      "def make_foo(x: int) -> Foo:",
      "    return Foo()",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    const cases = [
      {
        query: "queries/python/function-signatures.scm",
        expected: [/signature\.name.*make_foo/, /signature\.params.*\(x: int\)/, /signature\.return.*Foo/],
      },
      {
        query: "queries/python/imports.scm",
        expected: [/import\.source.*typing/, /import\.name.*Any/, /import\.alias.*AnyType/, /import\.star.*\*/],
      },
      {
        query: "queries/python/exports.scm",
        expected: [/export\.name.*make_foo/, /export\.class.*Foo/, /export\.value.*VALUE/],
      },
      {
        query: "queries/python/type-declarations.scm",
        expected: [/type\.class.*Foo/, /type\.alias.*UserId/],
      },
    ];

    for (const { query, expected } of cases) {
      const queryPath = join(packageRoot, query);
      const { stdout, stderr } = await runTreeSitter(["query", "--captures", queryPath, fixturePath]);
      const output = `${stdout}\n${stderr}`;
      for (const pattern of expected) assert.match(output, pattern, `${query} should match ${pattern}`);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
