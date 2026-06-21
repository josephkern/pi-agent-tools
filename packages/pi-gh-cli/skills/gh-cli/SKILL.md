---
name: gh-cli
description: Use the GitHub CLI through pi for GitHub repository, issue, pull request, workflow, and release operations. Prefer token-efficient JSON output and safe markdown body handling.
---

# GitHub CLI Workflows

Use this skill when working with GitHub through the `gh_cli` tool.

## Default workflow

1. Prefer explicit repository context with `--repo owner/repo` unless the current git remote is known to be correct.
2. Prefer token-efficient output flags:
   - `--json <fields>`
   - `--jq <filter>`
   - `--limit <n>`
3. Use read-only commands for discovery:
   - `auth status`
   - `repo view`
   - `issue list` / `issue view`
   - `pr list` / `pr view`
   - `run list` / `run view`
4. Ask the user before mutating GitHub state, including issue creation/editing/closing, PR operations, release operations, workflow dispatches, and repo settings.

## Multiline Markdown bodies

For multiline Markdown, always use `--body-file` with a real file. Do not pass strings containing literal `\n`; GitHub will render those as backslash-n text instead of line breaks.

Recommended pattern:

```bash
body_file=$(mktemp)
cat > "$body_file" <<'EOF'
## Problem
Describe the problem here.

## Scope
- First item
- Second item

## Acceptance criteria
- Done means this
EOF

gh issue create \
  --repo owner/repo \
  --title "Issue title" \
  --body-file "$body_file"
```

For editing an existing issue:

```bash
body_file=$(mktemp)
cat > "$body_file" <<'EOF'
## Updated body

Markdown renders correctly because this is a real multiline file.
EOF

gh issue edit 123 \
  --repo owner/repo \
  --body-file "$body_file"
```

When using `gh_cli`, create the temporary file with a normal shell tool first, then call:

```json
{
  "args": ["issue", "edit", "123", "--repo", "owner/repo", "--body-file", "/tmp/body.md"]
}
```

## Token-efficient examples

List issues:

```json
{
  "args": [
    "issue", "list",
    "--repo", "owner/repo",
    "--json", "number,title,state,updatedAt",
    "--limit", "20"
  ]
}
```

View a workflow run summary:

```json
{
  "args": [
    "run", "view", "123456789",
    "--repo", "owner/repo",
    "--json", "databaseId,status,conclusion,headSha,url"
  ]
}
```

Use `--jq` to reduce output further when a small projection is enough.
