import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(packageRoot, "skills");
const queriesRoot = join(packageRoot, "queries");

async function loadSkills() {
  const skills = [];
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(skillsRoot, entry.name);
    const filePath = join(skillDir, "SKILL.md");
    skills.push({ name: entry.name, dir: skillDir, text: await readFile(filePath, "utf8") });
  }
  assert.ok(skills.length > 0, "expected at least one skill");
  return skills;
}

async function listQueryFiles() {
  const files = [];
  for (const language of await readdir(queriesRoot)) {
    for (const file of await readdir(join(queriesRoot, language))) {
      if (file.endsWith(".scm")) files.push(`${language}/${file}`);
    }
  }
  return files;
}

test("every .scm path referenced in a skill resolves relative to its skill directory", async () => {
  for (const skill of await loadSkills()) {
    const references = skill.text.match(/[\w./-]*\w\.scm/g) ?? [];
    for (const ref of references) {
      // Placeholder-rooted examples and project-recipe location advice are
      // not shipped files.
      if (ref.startsWith("/") || ref.includes("tree-sitter/queries")) continue;
      const resolved = resolve(skill.dir, ref);
      const exists = await stat(resolved).then(() => true, () => false);
      assert.ok(exists, `${skill.name}: referenced query does not exist: ${ref}`);
    }
  }
});

test("every shipped query file is documented in the recipes skill", async () => {
  const recipes = (await loadSkills()).find((s) => s.name === "tree-sitter-recipes");
  assert.ok(recipes, "tree-sitter-recipes skill must exist");
  for (const file of await listQueryFiles()) {
    assert.ok(recipes.text.includes(file), `recipes skill does not document queries/${file}`);
  }
});

test("capture names in the recipes skill and shipped queries agree", async () => {
  const recipes = (await loadSkills()).find((s) => s.name === "tree-sitter-recipes");
  const skillCaptures = new Set(recipes.text.match(/@\w+(?:\.\w+)+/g) ?? []);

  const queryCaptures = new Set();
  for (const file of await listQueryFiles()) {
    const source = await readFile(join(queriesRoot, file), "utf8");
    const withoutComments = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith(";"))
      .join("\n");
    for (const capture of withoutComments.match(/@\w+(?:\.\w+)+/g) ?? []) queryCaptures.add(capture);
  }

  for (const capture of skillCaptures) {
    assert.ok(queryCaptures.has(capture), `recipes skill mentions ${capture} but no shipped query defines it`);
  }
  for (const capture of queryCaptures) {
    assert.ok(skillCaptures.has(capture), `shipped queries define ${capture} but the recipes skill does not document it`);
  }
});

test("tool names mentioned in skills are registered by the extension", async () => {
  const { default: extension } = await import(`../src/index.ts?skills-test=${Date.now()}`);
  const registered = new Set();
  extension({ registerTool: (tool) => registered.add(tool.name) });

  for (const skill of await loadSkills()) {
    for (const name of new Set(skill.text.match(/tree_sitter_\w+/g) ?? [])) {
      assert.ok(registered.has(name), `${skill.name} mentions unregistered tool: ${name}`);
    }
  }
});

test("parameter names used in skill examples exist in the tool schemas", async () => {
  const schemas = await import(`../src/schemas.ts?skills-test=${Date.now()}`);
  const schemaKeys = new Set();
  for (const schema of Object.values(schemas)) {
    for (const key of Object.keys(schema.properties ?? {})) schemaKeys.add(key);
  }

  for (const skill of await loadSkills()) {
    for (const match of skill.text.matchAll(/(\w+)=(?:"|true|false|\[)/g)) {
      const param = match[1];
      assert.ok(schemaKeys.has(param), `${skill.name} uses unknown tool parameter: ${param}`);
    }
  }
});
