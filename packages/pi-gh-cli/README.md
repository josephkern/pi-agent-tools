# @josephakern/pi-gh-cli

Thin pi extension for exposing the existing GitHub CLI (`gh`) to agents.

## Contract

This package does not install, bundle, or authenticate GitHub CLI. It requires an existing `gh` executable on `PATH`, or `GH_BIN=/absolute/path/to/gh`, and whatever auth state `gh` normally uses.

The tool runs `gh` with an argument array and no shell. Output is capped and formatted for pi.

## Principle

Expose the tool, do not domesticate it. The GitHub CLI is the abstraction; this package should stay a safe, capped, convenient doorway to `gh`.

## Tool

- `gh_cli` — runs `gh` with explicit `args`, excluding the leading `gh`

Example:

```json
{
  "args": ["issue", "list", "--repo", "josephkern/pi-agent-tools", "--json", "number,title,state", "--limit", "20"]
}
```

For token efficiency, prefer `gh` flags such as:

- `--json`
- `--jq`
- `--limit`
- `--repo owner/repo`

Agents should ask before mutating GitHub state, such as creating/editing issues, changing PRs, managing releases, or dispatching workflows.

## Development

From the repository root:

```bash
npm install
npm run check
npm test
```

Temporary pi load:

```bash
pi -e ./packages/pi-gh-cli
```

Project-local install once stable:

```bash
pi install -l ./packages/pi-gh-cli
```
