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
archmap classify <file>           # leaf | branch | hub + Ca, instability, risk, reason
archmap check <file>...           # exit 1 if ANY input is a hub (CI gate)
archmap explain <file>            # list dependents + classification rationale
archmap risk [--top N]            # rank files by combined topology + churn risk
archmap export                    # emit a self-contained classified artifact (JSON)
```

All commands accept `--json` for machine-readable output (`export` is always JSON). All commands accept `--config <path>` to point at an alternate `.archmap.yaml`.

**Config discovery.** When `--config` is omitted, `archmap` walks up from the
current directory to the nearest `.archmap.yaml` and treats that directory as
the project root (chdir'ing into it), so you can run any command from a
subdirectory and still analyse the whole tree. `entry` paths in a discovered
config resolve relative to the config file's directory. (With an explicit
`--config`, paths resolve relative to your current directory.)

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
#   "tca": 63,
#   "instability": 0.06,
#   "risk": { "risk": 100, "structural": 8.41, "churn": 3.14, "tca": 63, "commits": 22 },
#   "reason": "Ca=14 (14 direct, 63 transitive)",
#   "overridden": false
# }
```

### check

Exit code `0` = no hubs in changeset. Exit code `1` = at least one hub touched.

```bash
archmap check $(git diff --name-only main)
# load-bearing (hub) files detected:
#   src/auth/TokenValidator.ts  Ca=14 (63 transitive)  risk=100/100
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

### risk

`classify`/`explain`/`check` answer "how connected is this file?" — a pure
topology question. `risk` answers "where is fragility concentrated *right
now*?" by folding in **git churn** (how often a file has changed recently).
A hub nobody touches is stable; a hub under constant churn is where incidents
come from.

```bash
archmap risk --top 5
# Top 5 riskiest files:
#
#   100/100  src/auth/TokenValidator.ts
#          ca=14  tca=63  churn=22c/90d  structural=8.41
#    91/100  src/utils/format.ts
#          ca=12  tca=40  churn=9c/90d   structural=6.77
#   ...
```

```bash
archmap risk --top 1 --json
# [
#   {
#     "file": "src/auth/TokenValidator.ts",
#     "risk": 100,        # percentile rank across the repo (0–100)
#     "structural": 8.41, # log1p(Ca) + 1.5·log1p(tCa)
#     "churn": 3.14,      # log1p(commits in window)
#     "tca": 63,          # transitive afferent coupling
#     "commits": 22       # commits touching this file in the last 90 days
#   }
# ]
```

**Risk model.** Each file gets a raw score `0.6·structural + 0.4·churn`, then
risk is the **percentile rank** of that raw score across the repo (0–100, ties
share a rank, a lone file scores 50). Components:

- **structural** = `log1p(Ca) + 1.5·log1p(tCa)` — direct *and* transitive
  fan-in, log-damped so a 200-dependent file isn't 10× a 20-dependent one.
  Transitive coupling (`tCa`) is weighted higher: indirect blast radius is
  what makes a change scary.
- **churn** = `log1p(commits in the last 90 days)` — recency-bounded edit
  frequency from `git log`.

Risk is **advisory context, not a gate** — `check` still keys off `class`
alone. Use `risk` to prioritise review attention and refactoring, not to block
merges. The same `risk` block is attached to every `classify` result, so a
builder agent gets it for free on its pre-edit probe.

### export

The other commands answer one file at a time and need the source tree present
to build the graph. `export` answers the whole repo **once** and bakes the
verdicts into a single self-contained JSON — so a consumer with *no source
tree* (a hosted review bot that only ever sees a diff) can classify changed
files by pure lookup.

```bash
archmap export > archmap.json
# {
#   "version": 1,
#   "commit": "36d9aef…",            # so a consumer can verify it matches the PR head SHA
#   "generatedAt": "2026-05-29T19:37:36.047Z",
#   "files": {
#     "src/auth/TokenValidator.ts": {
#       "class": "hub", "ca": 14, "tca": 63,
#       "instability": 0.06, "risk": 100,
#       "overridden": false,
#       "reason": "Ca=14 (14 direct, 63 transitive)",
#       "dependents": ["src/api/login.ts", "…"]   // the off-diff blast radius
#     },
#     // … every file in the topology
#   }
# }
```

**The artifact is derived data — never commit it.** Committing a repo-wide
generated file means churn on every PR and a guaranteed merge conflict between
any two concurrent PRs. Instead, build it in CI (which has the tree) and ship
it *out of band*, keyed by commit SHA.

#### Consuming the artifact (diff-only review bot)

A bot has the changed paths but no graph. The integration is: **CI builds the
artifact, the bot looks paths up in it.**

1. **CI** runs `archmap export` on every PR and uploads `archmap.json` to the
   workflow run, named `archmap-<head-sha>` — see
   [`.github/workflows/archmap.yml`](.github/workflows/archmap.yml). Use
   `fetch-depth: 0` so churn (90-day window) sees real commit dates, and run
   from the repo root so artifact keys are repo-root-relative.
2. **The bot**, on the PR webhook, has the head SHA. It downloads the matching
   artifact via the GitHub Actions API and does pure lookups — no clone, no
   Node, no archmap install:

   ```js
   // pseudo-bot — paths from the diff, verdicts from the artifact
   const art = await fetchArtifact(`archmap-${pr.head.sha}`); // GH Actions API
   if (art.commit !== pr.head.sha) return; // stale artifact, skip

   const changed = await diffNames(pr.base.sha, pr.head.sha); // git diff --name-only
   const hubs = changed
     .map((p) => ({ path: p, ...art.files[p] }))
     .filter((v) => v?.class === "hub");

   if (hubs.length) {
     comment(
       "⚠️ load-bearing files in this diff:\n" +
       hubs.map((h) => `- \`${h.path}\` — ${h.dependents.length} dependents (risk ${h.risk}/100)`).join("\n")
     );
   }
   ```

   The `dependents` array is the payload the bot can't get from a diff: the
   files that import the changed one but aren't in the changeset.

**Path matching is the one thing to verify.** `git diff --name-only` yields
repo-root-relative paths; artifact keys are repo-root-relative *as long as CI
runs `archmap export` from the repo root*. If your bot's diff paths and the
artifact keys ever drift (renames, monorepo subdirs), normalize both sides to
the same root before lookup. A miss is silent — `art.files[p]` is just
`undefined` — so assert that every changed `.ts`/`.tsx` path resolves.

If you need the artifact to outlive Actions' retention or to be reachable
outside GitHub, swap the upload step for a `PUT` to a blob store keyed by SHA
(`…/<sha>/archmap.json`); the bot's fetch URL changes, nothing else does.

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

**Churn cache.** Risk scoring also needs git history, which is independent of
import structure. The churn map is cached separately, keyed on the current git
`HEAD` and the window length — so a body edit doesn't bust it, but a new commit
does. Repeated `classify`/`risk`/`check` calls at the same `HEAD` (e.g. a
pre-commit run touching many files) reuse one `git log` instead of shelling out
per file.

## Deferred features (v2+)

These are intentionally absent from v1:

- **C#/Roslyn analyzer** — config schema allows `analyzers[].lang: csharp` but only `typescript` is implemented. Doing it properly needs an LSP/compiler to resolve dependency injection and generics, so it's a large task deferred until there's demand. Node+TypeScript is the focus.
- **Dirty-subgraph partial rebuild** — full rescan on miss; the cache makes it rare
- **Cycle / SCC handling** — `dependency-cruiser` can report cycles; classifying them is v2
- **A review bot** — `archmap` stays just the CLI. `export` + the sample workflow give a consumer everything it needs (see [export](#export)), but the bot that fetches the artifact and comments on PRs lives downstream.
