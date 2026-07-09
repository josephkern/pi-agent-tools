---
name: post-edit-syntax-check
description: Verify edited source files still parse cleanly using Tree-sitter. Use after making code edits, before running tests or reporting results.
---

# Post-edit Syntax Check

1. Run `tree_sitter_parse` with `mode="json-summary"` on the edited file paths.
2. For any unsuccessful file, run `tree_sitter_query` with `../../queries/universal/syntax-errors.scm` (relative to this skill's directory) and `compact=true`; the captures give exact error locations.
3. Fix and re-check before moving on.

This is a fast first signal, not a substitute for type checks or tests.
