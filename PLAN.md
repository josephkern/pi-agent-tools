# Tree-sitter Minimal Utility Plan

## Topline

Use Tree-sitter itself as the structural oracle. Prefer thin access to the existing `tree-sitter` CLI over custom parser abstractions.

## Razors

- Agents should not rely only on reading and guessing. They should ask tools for structural facts.
- The most efficient code is the code that is never written, maintained, or run.

## Finding that changes the plan

The installed CLI already exposes most of the useful primitive operations:

- `tree-sitter parse` — parse files, emit CST/XML/DOT/JSON summary, stats, timing, syntax-error exit status.
- `tree-sitter query` — run Tree-sitter queries over files, path lists, byte ranges, row ranges, and containing ranges.
- `tree-sitter tags` — emit definitions/references using standard `queries/tags.scm` files.
- `tree-sitter dump-languages` — show which language parsers the CLI can actually use.

Therefore the minimal implementation should not reimplement parsing, querying, tags, ranges, or batch file handling unless the CLI cannot provide the needed behavior.

## Goal

Expose maximum Tree-sitter utility to agents with the least maintained code:

- make parser availability explicit
- inspect syntax trees
- run raw queries
- generate symbol/reference tags when grammar tag queries exist
- preserve exact source locations
- cap output safely
- avoid language-specific outline/import/export/callee implementations

## Minimal tool surface

### 1. `tree_sitter_languages`

Thin wrapper around:

```bash
tree-sitter dump-languages
```

Purpose:

- tell the agent which parsers are actually available
- avoid guessing why a parse/query failed
- expose language scopes for ambiguous files

### 2. `tree_sitter_parse`

Thin wrapper around:

```bash
tree-sitter parse
```

Inputs:

- `paths` or `pathsFile`
- optional `scope`
- optional output mode: `cst`, `xml`, `dot`, or `json-summary`
- optional `timeout`
- optional `encoding`
- optional `stat` / `time`
- output cap

Defaults:

- use `NO_COLOR=1`
- default to compact CST for humans
- use JSON summary when the agent only needs parse success/failure

Purpose:

- discover grammar node names
- inspect structure before writing queries
- detect syntax errors without custom parsing code

### 3. `tree_sitter_query`

Thin wrapper around:

```bash
tree-sitter query <query-file> <paths...>
```

Inputs:

- `query` or `queryFile`
- `paths` or `pathsFile`
- optional `scope`
- optional `captures`
- optional `rowRange` / `byteRange`
- optional `containingRowRange` / `containingByteRange`
- optional `time`
- output cap

Implementation note:

- If `query` is passed inline, write it to a temporary `.scm` file and invoke the CLI.
- Do not parse query results into a bespoke semantic model unless repeated use proves it is worth maintaining.

Purpose:

- one primitive covers functions, classes, imports, exports, calls, assignments, SQL statements, shell commands, tests, unsafe blocks, and syntax errors
- range-limited queries replace custom enclosing-scope call extraction
- query files/recipes replace hard-coded source helpers

### 4. `tree_sitter_tags`

Thin wrapper around:

```bash
tree-sitter tags
```

Inputs:

- `paths` or `pathsFile`
- optional `scope`
- optional `time`
- output cap

Purpose:

- use Tree-sitter's existing code-navigation convention instead of writing custom outline/callee tools
- expose definitions and references when a grammar provides `queries/tags.scm`

Standard tag captures include:

- `@definition.class`
- `@definition.function`
- `@definition.method`
- `@definition.module`
- `@reference.call`
- `@name`
- optional `@doc`

## What not to build first

Do not initially implement custom versions of:

- parser loading/runtime management
- AST node models
- outline extractors
- import/export extractors
- callee extractors
- semantic call graphs
- type-aware resolution
- codemod engines

The CLI and query language already cover the structural layer. Native language stacks should cover linting, typing, building, and runtime behavior.

## Query recipes, not abstractions

Keep common patterns as plain text `.scm` recipes plus a small skill that teaches when to use them:

```text
queries/
  universal/syntax-errors.scm
  typescript/function-signatures.scm
  typescript/imports.scm
  typescript/tool-registrations.scm
  javascript/function-signatures.scm
  python/function-signatures.scm
skills/tree-sitter-recipes/SKILL.md
```

Recipes are cheaper than helper code. They can be copied, edited, reviewed, and deleted without changing the tool runtime. Ship a small reliable catalog, but leave project-specific patterns in project/user recipe space such as `.pi/tree-sitter/queries/` or `tree-sitter/queries/`.

Use `tree_sitter_tags` as the first-pass built-in navigation primitive. Use `.scm` recipes when tags are too coarse, for example when the user needs parameters, return types, import clauses, or package-specific registration patterns.

Useful universal recipe:

```scheme
(ERROR) @syntax.error
(MISSING) @syntax.missing
```

Language-specific recipes should share semantic capture contracts where possible, for example `@signature.name`, `@signature.params`, and `@signature.return`.

## Parser availability

The CLI finds grammars through `~/.config/tree-sitter/config.json` `parser-directories`. A greenfield implementation should first expose availability rather than pretending all languages are present.

Local observation after this review:

```text
tree-sitter 0.26.9
dump-languages currently reports Python only in this environment
```

If broad out-of-the-box language coverage is required, prefer adding/configuring grammar repositories for the CLI before writing a custom runtime. Only keep a WASM runtime if CLI parser availability cannot meet the requirement.

## Optional managed grammar cache

Option A is to use npm grammar packages with a tool-local Tree-sitter config, without mutating the user's global config.

Managed directory:

```text
~/.local/share/pi-tree-sitter-cli/
  config.json
  package.json
  package-lock.json
  node_modules/
  cache/       # XDG_CACHE_HOME for tree-sitter CLI invocations
  npm-cache/   # npm cache for managed grammar installs
```

Managed config:

```json
{
  "parser-directories": ["~/.local/share/pi-tree-sitter-cli/node_modules"]
}
```

Tools:

- `tree_sitter_grammar_status` — inspect the tool-local cache and discovered languages.
- `tree_sitter_grammar_install` — explicitly run npm install into the tool-local cache and rewrite the tool-local config.

Rules:

- Never mutate `~/.config/tree-sitter/config.json`.
- Keep Tree-sitter and npm caches under the tool-local directory when these tools execute.
- Never auto-install grammar packages during parse/query/tags.
- Default npm install uses `--ignore-scripts`; allow scripts only with explicit `allowScripts=true`.
- Use npm's nested install strategy so package-relative query paths like `node_modules/tree-sitter-javascript/queries/tags.scm` remain valid.
- Document that npm grammar packages may contain native parser artifacts and should be trusted before install.

Existing parse/query/tags/languages tools accept `configPath` or `useManagedConfig` so the agent can opt into either an explicit config or the tool-local managed config.

## Agentic source organization option C

When the package grows beyond the current single-file implementation, prefer a tool-per-file layout with shared context and helpers. This keeps source navigation predictable for agents: the tool name should map directly to the file that registers it.

Recommended shape:

```text
src/
  index.ts
  context.ts               # shared runtime dependencies and helper bundle
  constants.ts
  schemas.ts               # TypeBox parameter schemas
  params.ts                # parameter readers and validation helpers
  process.ts               # process execution and executable resolution
  managed-grammar-cache.ts # tool-local grammar cache paths/config/dependencies
  output.ts                # truncation, formatting, ANSI stripping
  cli-args.ts              # tree-sitter/npm argument builders
  tools/
    tree_sitter_languages.ts
    tree_sitter_parse.ts
    tree_sitter_query.ts
    tree_sitter_tags.ts
    tree_sitter_grammar_status.ts
    tree_sitter_grammar_install.ts
```

Each tool module should export one registration function, for example:

```ts
export function registerParseTool(pi: ExtensionAPI, ctx: ToolContext): void {
  pi.registerTool({ ... });
}
```

Rules for this layout:

- Keep `src/index.ts` as orchestration only: create the shared context and call the six registration functions.
- Keep side-effecting process and filesystem helpers behind `ToolContext` so tests can inject fakes.
- Keep CLI argument builders pure and unit-testable.
- Keep query recipes as `.scm` assets, not TypeScript abstractions.
- Prefer adding a new tool file over appending another large registration block to `src/index.ts`.

## Agent workflow

1. Run `tree_sitter_languages` to confirm parser availability.
2. Run `tree_sitter_parse` on a representative file to learn node names.
3. Run `tree_sitter_query` with an inline query or recipe.
4. Use `tree_sitter_tags` for definitions/references when available.
5. Read only the matching source ranges.
6. Validate edits with the language stack: formatter, linter, type checker, build, and tests.

## MVP acceptance tests

- `tree_sitter_languages` reports available parsers.
- `tree_sitter_parse` returns CST and JSON-summary output for Python.
- `tree_sitter_query` accepts inline query text and query-file paths.
- `tree_sitter_query` supports row-range and containing-row-range.
- `tree_sitter_tags` returns function/class definitions and call references for Python.
- Every command has output caps and clear truncation notices.
- Unsupported or unavailable languages fail clearly with guidance to check `tree_sitter_languages`.

## Principle

Expose Tree-sitter, do not domesticate it. The query language is the abstraction; the plugin should mostly be a safe, capped, convenient doorway to the CLI.
