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

async function dumpLanguages() {
  try {
    const { stdout, stderr } = await runTreeSitter(["dump-languages"]);
    return `${stdout}\n${stderr}`;
  } catch {
    return "";
  }
}

async function hasPythonParser() {
  const output = await dumpLanguages();
  return /scope:\s*source\.python\b/.test(output) || /name:\s*python\b/.test(output);
}

async function hasTypeScriptParser() {
  const output = await dumpLanguages();
  return /scope:\s*source\.ts\b/.test(output) || /name:\s*typescript\b/.test(output);
}

async function parsesJsFiles() {
  // Any grammar claiming the js file type works: tree-sitter-javascript or a
  // TypeScript-family grammar (the recipes support both node shapes).
  return /file_types:.*"js"/.test(await dumpLanguages());
}

async function runRecipeCases(fixturePath, cases) {
  for (const { query, expected } of cases) {
    const queryPath = join(packageRoot, query);
    const { stdout, stderr } = await runTreeSitter(["query", "--captures", queryPath, fixturePath]);
    const output = `${stdout}\n${stderr}`;
    for (const pattern of expected) assert.match(output, pattern, `${query} should match ${pattern}`);
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

    await runRecipeCases(fixturePath, cases);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("typescript query recipes match a representative fixture when parser is available", async () => {
  if (!(await hasTypeScriptParser())) return;

  const tempRoot = await mkdtemp(join(tmpdir(), "pi-tree-sitter-recipes-"));
  const fixturePath = join(tempRoot, "fixture.ts");
  await writeFile(
    fixturePath,
    [
      'import type { OnlyType } from "mod-a";',
      'import * as ns from "mod-b";',
      'import def, { named as alias } from "mod-c";',
      "",
      "export abstract class AbsService {}",
      "export enum Color { Red }",
      'export * from "./re-exported";',
      'export { helper } from "./helpers";',
      "export const exportedConst = 1;",
      "export interface Iface { m(k: string): void; }",
      "export type Alias = string;",
      "",
      "const arrowFn = (a: string): boolean => a.length > 0;",
      "const fnExpr = function inner(y: number) { return y; };",
      "class Holder {",
      "  field = (n: number) => n + 1;",
      "  method(v: number): number { return v; }",
      "}",
      "export default function main(): void {}",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    await runRecipeCases(fixturePath, [
      {
        query: "queries/typescript/function-signatures.scm",
        expected: [
          /signature\.name.*arrowFn/,
          /signature\.name.*fnExpr/,
          /signature\.name.*field/,
          /signature\.name.*main/,
          /signature\.params.*\(a: string\)/,
          /signature\.return.*boolean/,
        ],
      },
      {
        query: "queries/typescript/imports.scm",
        expected: [
          /import\.source.*mod-a/,
          /import\.namespace.*ns/,
          /import\.default.*def/,
          /import\.name.*named/,
          /import\.alias.*alias/,
        ],
      },
      {
        query: "queries/typescript/exports.scm",
        expected: [
          /export\.class.*AbsService/,
          /export\.enum.*Color/,
          /export\.source.*re-exported/,
          /export\.source.*helpers/,
          /export\.name.*helper/,
          /export\.value.*exportedConst/,
          /export\.interface.*Iface/,
          /export\.type.*Alias/,
          /export\.function.*main/,
        ],
      },
      {
        query: "queries/typescript/type-declarations.scm",
        expected: [/type\.class.*AbsService/, /type\.class.*Holder/, /type\.enum.*Color/, /type\.alias.*Alias/],
      },
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("javascript query recipes match a representative fixture when a js parser is available", async () => {
  if (!(await parsesJsFiles())) return;

  const tempRoot = await mkdtemp(join(tmpdir(), "pi-tree-sitter-recipes-"));
  const fixturePath = join(tempRoot, "fixture.js");
  await writeFile(
    fixturePath,
    [
      'import def, { named as alias } from "mod-a";',
      'import * as ns from "mod-b";',
      "",
      "export class Widget {}",
      'export { helper } from "./helpers";',
      "export const value = 1;",
      "",
      "const arrowFn = (x, y) => x + y;",
      "const fnExpr = function inner(z) { return z; };",
      "function* gen(a) { yield a; }",
      "class Box {",
      "  make = (n) => n;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    await runRecipeCases(fixturePath, [
      {
        query: "queries/javascript/function-signatures.scm",
        expected: [
          /signature\.name.*arrowFn/,
          /signature\.name.*fnExpr/,
          /signature\.name.*gen/,
          /signature\.name.*make/,
          /signature\.params.*\(x, y\)/,
        ],
      },
      {
        query: "queries/javascript/imports.scm",
        expected: [
          /import\.source.*mod-a/,
          /import\.default.*def/,
          /import\.name.*named/,
          /import\.alias.*alias/,
          /import\.namespace.*ns/,
        ],
      },
      {
        query: "queries/javascript/exports.scm",
        expected: [
          /export\.class.*Widget/,
          /export\.name.*helper/,
          /export\.source.*helpers/,
          /export\.value.*value/,
        ],
      },
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
