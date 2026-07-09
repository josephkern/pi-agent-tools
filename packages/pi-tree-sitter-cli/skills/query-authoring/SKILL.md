---
name: tree-sitter-query-authoring
description: Author a new Tree-sitter .scm query from a user's structural question when no shipped recipe fits. Use when asked to find, list, or count a code pattern that existing recipes do not cover.
---

# Authoring Tree-sitter Queries

1. Get real node names first: `tree_sitter_parse` a small representative file, or write a minimal snippet to a temp file and parse that. Never guess node names.
2. Draft the smallest inline query and run `tree_sitter_query(query="...", captures=true, compact=true)` against one file.
3. A non-zero exit means the query is invalid: read the error, fix node and field names against the parse output, retry.
4. Anchor patterns with fields (`name:`, `body:`, `value:`); use `#eq?`/`#match?`/`#not-eq?` predicates for text constraints, `[...]` for alternatives, and `(_)` wildcards where grammars vary.
   Example: `((call_expression function: (identifier) @fn) (#eq? @fn "require"))`
5. Validate both ways: run against a file known to contain the pattern and one known not to.
6. Reuse the shared capture contract (`@signature.*`, `@import.*`, `@export.*`, `@type.*`) when the concept matches; otherwise name captures `@<topic>.<role>`.
7. Save the query only if it will be reused: `.pi/tree-sitter/queries/<language>/<task>.scm` in the project, with a header comment stating its capture contract. One-off queries stay inline.
