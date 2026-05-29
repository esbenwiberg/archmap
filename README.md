# archmap

Classify every file in a Node+TypeScript repo as `leaf | branch | hub` based on dependency topology. AI builder and reviewer agents shell out to the same binary and get the same answer — one shared artifact, opposite behaviours.

## The model

Classification is based on **afferent coupling (Ca)** — how many files import a given file.

| Class    | Ca                         | Meaning for an agent                              |
|----------|----------------------------|---------------------------------------------------|
| `leaf`   | ≤ threshold.leaf (2)       | Nothing depends on it. Change freely.             |
| `branch` | > leaf, ≤ junction (3–10)  | Moderate blast radius. Warn, soft-flag.           |
| `hub`    | > threshold.junction (10)  | Many things depend on it. Mandatory human review. |

Also computed: **instability** `I = Ce / (Ca + Ce)` (Robert Martin's metric). Reported for context; the primary classification signal is Ca.

`.archmap.yaml` carries `overrides` that always win over computed class. This is where Ca can't see risk (security boundaries, published contracts, legacy code scheduled for deletion).

## Install

```bash
npm install -g archmap
# or run locally:
npx tsx bin/archmap.ts <command>
```

## Commands

```bash
archmap scan                      # rebuild topology → .archmap/topology.json
archmap classify <file>           # leaf | branch | hub + Ca, instability, reason
archmap check <file>...           # exit 1 if ANY input is a hub (CI gate)
archmap explain <file>            # list dependents + classification rationale
```

All commands accept `--json` for machine-readable output. All commands accept `--config <path>` to point at an alternate `.archmap.yaml`.

### scan

```bash
archmap scan
# Scanned 47 files → .archmap/topology.json
```

### classify

```bash
archmap classify src/auth/TokenValidator.ts --json
# {
#   "file": "src/auth/TokenValidator.ts",
#   "class": "hub",
#   "ca": 14,
#   "instability": 0.06,
#   "reason": "Ca=14 (14 dependents)",
#   "overridden": false
# }
```

### check

Exit code `0` = no hubs in changeset. Exit code `1` = at least one hub touched.

```bash
archmap check $(git diff --name-only main)
# load-bearing (hub) files detected:
#   src/auth/TokenValidator.ts  Ca=14  Ca=14 (14 dependents)
# [exits 1]
```

### explain

```bash
archmap explain src/utils/format.ts
# src/utils/format.ts
#   class:     hub
#   reason:    Ca=12 (12 dependents)
#   ca:        12 (12 files depend on this)
#   dependents:
#     src/components/DatePicker.ts
#     src/services/ReportService.ts
#     ...
```

## Configuration: `.archmap.yaml`

Commit this file. It is the human source of truth.

```yaml
version: 1

thresholds:
  leaf: 2        # Ca <= 2  → leaf
  junction: 10   # Ca > 10  → hub; between is branch

# Overrides always win over computed class.
overrides:
  - path: "packages/formbuilder/src/schema/**"
    classification: hub
    reason: "Schema contract shipped to partners — external blast radius"
  - path: "src/auth/TokenValidator.ts"
    classification: hub
    reason: "Security boundary, low internal fan-in but high risk"
  - path: "src/legacy/**"
    classification: leaf
    reason: "Frozen, scheduled for deletion — don't gate"

analyzers:
  - lang: typescript
    entry: "src/"
```

If `.archmap.yaml` is absent, defaults apply: thresholds 2/10, no overrides, entry `src/`.

## Agent recipes

### Builder agent — pre-edit probe

```bash
FILE="src/auth/TokenValidator.ts"
RESULT=$(archmap classify "$FILE" --json)
CLASS=$(echo "$RESULT" | jq -r '.class')

if [ "$CLASS" = "hub" ]; then
  echo "⚠ Hub file detected. Make smallest possible diff, preserve public interface."
  echo "Note contract impact in PR description."
else
  echo "Leaf/branch — proceed freely."
fi
```

Or as a preamble snippet for your agent:

```
Before editing any file, run: archmap classify <file> --json
If class == "hub":
  - Make the smallest possible diff
  - Preserve the public interface exactly
  - Note contract impact in the PR description
If class == "leaf" or "branch": proceed normally
```

### Reviewer agent — PR gate

```bash
HUB_CHECK=$(archmap check $(git diff --name-only main) --json)
HAS_HUBS=$(echo "$HUB_CHECK" | jq -r '.hasHubs')

if [ "$HAS_HUBS" = "true" ]; then
  echo "$HUB_CHECK" | jq -r '.hubs[] | "Hub: \(.file)  Ca=\(.ca)"'
  gh pr edit --add-label "requires-human-review"
fi
```

### Pre-commit hook

Add to `.git/hooks/pre-commit` (or via husky/lint-staged):

```bash
#!/bin/sh
archmap check $(git diff --cached --name-only)
```

## Caching

`.archmap/` is a derived cache — **add it to `.gitignore`**:

```
.archmap/
```

`.archmap.yaml` is config — **commit it**.

The cache key hashes only import/export structure (not function bodies), so editing a leaf function body doesn't invalidate the graph. `classify` and `check` are near-instant when structure is unchanged.

## Deferred features (v2+)

These are intentionally absent from v1:

- **C#/Roslyn analyzer** — config schema allows `analyzers[].lang: csharp` but only `typescript` is implemented
- **Dirty-subgraph partial rebuild** — full rescan on miss; the cache makes it rare
- **Cycle / SCC handling** — `dependency-cruiser` can report cycles; classifying them is v2
- **CI / review tool integration** — `archmap` is just the CLI; wiring into pipelines is downstream
