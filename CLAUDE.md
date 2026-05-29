# archmap — build spec

## What this is

A standalone CLI that classifies every file in a Node+TypeScript repo as `leaf | branch | hub` based on dependency topology, so AI builder and reviewer agents can read one shared artifact and adjust behaviour.

## Classification model

Built on afferent coupling (Ca) = number of files that import a given file (fan-in), computed by inverting the dependency graph that `dependency-cruiser` produces.

```
leaf:    Ca <= thresholds.leaf       (default 2)
branch:  leaf < Ca <= junction       (default 3–10)
hub:     Ca > thresholds.junction    (default 10)
```

Also compute instability `I = Ce / (Ca + Ce)` (reported for context, not used for classification).

## Vocabulary (locked)

Three classes: `leaf | branch | hub`. All positional graph/tree terms. Do not change the enum. Human-facing output may use "load-bearing (hub)" in PR comments but the machine-readable enum stays `hub`.

## Package layout

```
archmap/
  package.json
  tsconfig.json
  bin/
    archmap.ts            # CLI entry — commander wiring
  src/
    config.ts             # load + validate .archmap.yaml, apply defaults
    graph.ts              # run dependency-cruiser, invert to adjacency + Ca/Ce
    classify.ts           # topology + config → leaf|branch|hub + reason
    cache.ts              # structure-hash freshness check
    commands/
      scan.ts             # rebuild topology → .archmap/topology.json
      classify.ts         # classify one file → stdout (human or --json)
      check.ts            # gate: non-zero exit if any input is a hub
      explain.ts          # who depends on a file + why it's classified so
```

ESM (`"type": "module"`), Node >=18, TypeScript strict.

## Dependencies

- `dependency-cruiser` (^16) — graph builder
- `commander` (^12) — CLI
- `yaml` (^2) — parse `.archmap.yaml`
- `micromatch` (^4) — glob matching for overrides
- dev: `typescript`, `tsx`, `@types/node`, `vitest`

## CLI surface

```
archmap scan                      # rebuild topology, write .archmap/topology.json
archmap classify <file>           # → leaf | branch | hub (+ Ca, instability, reason)
archmap check <file>...           # exit non-zero if ANY input is a hub (CI/hook gate)
archmap explain <file>            # list dependents + classification rationale
```

Global flag: `--json` on every command.

- `check` exit codes: `0` = no hubs, `1` = at least one hub in changeset.
- All commands are cache-aware via `getFreshTopology()`.

## Config file: `.archmap.yaml`

```yaml
version: 1

thresholds:
  leaf: 2        # Ca <= 2  → leaf
  junction: 10   # Ca > 10  → hub; between is branch

overrides:
  - path: "packages/formbuilder/src/schema/**"
    classification: hub
    reason: "Schema contract shipped to partners — external blast radius"
  - path: "src/auth/TokenValidator.ts"
    classification: hub
    reason: "Security boundary, low internal fan-in but high risk"

analyzers:
  - lang: typescript
    entry: "src/"
```

`config.ts` must default the whole file if absent (thresholds 2/10, empty overrides, entry `src/`).

## Caching — structure hash

Hash only import/export lines, not file bodies:

```ts
const imports = src.match(/^(import|export).*from\s+['"].*['"]/gm) ?? [];
```

Store `{ hash, topology }` at `.archmap/cache.json`. `.archmap/` is gitignored (derived cache). `.archmap.yaml` is committed.

## graph.ts sketch

```ts
import { cruise } from "dependency-cruiser";

export interface FileNode { ca: number; ce: number; dependents: string[]; }
export interface Topology { files: Record<string, FileNode>; }

export async function buildTopology(entry: string): Promise<Topology> {
  const result = await cruise([entry], {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(test|spec)\\.tsx?$" },
  });
  const modules = (result.output as any).modules as Array<{
    source: string;
    dependencies: Array<{ resolved: string; coreModule?: boolean }>;
  }>;

  const dependents: Record<string, string[]> = {};
  const ce: Record<string, number> = {};
  for (const m of modules) {
    ce[m.source] = m.dependencies.filter(d => !d.coreModule).length;
    for (const d of m.dependencies) (dependents[d.resolved] ??= []).push(m.source);
  }

  const files: Topology["files"] = {};
  for (const m of modules) {
    const deps = dependents[m.source] ?? [];
    files[m.source] = { ca: deps.length, ce: ce[m.source] ?? 0, dependents: deps };
  }
  return { files };
}
```

**Important:** Path normalization (relative vs absolute, `.ts` extension) is the most likely divergence point. Normalize override-glob matching and classify lookups against whatever form `.source` actually takes after install.

## classify.ts contract

```ts
export type Klass = "leaf" | "branch" | "hub";
export interface Classification {
  file: string;
  class: Klass;
  ca: number;
  instability: number;   // Ce / (Ca + Ce), 0 if both 0
  reason: string;        // override reason, or "Ca=N (N dependents)"
  overridden: boolean;
}
```

Resolution order: override match first (returns with `overridden: true`), else threshold logic on `ca`. File not found in topology → return `leaf` with `reason: "not in dependency graph"`, print warning to stderr.

## v1 scope — explicit cuts

In v1: `scan`, `classify`, `check`, `explain`; config + defaults + overrides; structure-hash cache; `--json` everywhere; TypeScript/Node only.

Deferred (do not build):
- C#/Roslyn analyzer (leave extension seam in config schema)
- Dirty-subgraph partial rebuild
- Cycle / SCC handling
- Any review-tool or CI integration code

## Acceptance criteria

Fixture repo under `fixtures/` with:
- `utils.ts` imported by 12 files → hub
- `helper.ts` imported by 1 file → leaf
- `service.ts` imported by 5 files → branch

1. `archmap scan` writes `.archmap/topology.json` with per-file `ca`, `ce`, `dependents`.
2. `archmap classify fixtures/src/utils.ts --json` → `class: "hub"`.
3. `archmap classify fixtures/src/helper.ts --json` → `class: "leaf"`.
4. `archmap classify fixtures/src/service.ts --json` → `class: "branch"`.
5. Override forcing `helper.ts` to `hub` → `class: "hub"`, `overridden: true`.
6. `archmap check fixtures/src/utils.ts` exits non-zero; `archmap check fixtures/src/helper.ts` exits zero.
7. `archmap explain fixtures/src/utils.ts` lists dependents.
8. Second `classify` without structure change does not rebuild graph.

Unit tests: graph inversion (Ca from known fixture), threshold boundaries (Ca == leaf threshold, Ca == junction threshold), override precedence, not-in-graph fallback.

## Build order

1. `package.json` + `tsconfig.json`, install deps, confirm `dependency-cruiser` output shape.
2. `graph.ts` + unit test asserting Ca on fixture.
3. `config.ts` (defaults + validation + override glob matching).
4. `classify.ts` + tests (boundaries, override precedence, fallback).
5. `cache.ts`.
6. Four commands + commander wiring in `bin/archmap.ts`.
7. Fixture repo + §11 acceptance checks end to end.
8. README.

## Agent recipes (for README)

**Builder agent** — before editing a file:
```bash
archmap classify <file> --json
# If class == "hub": make smallest possible diff, preserve public interface, note contract impact in PR
# If class == "leaf": proceed freely
```

**Reviewer agent** — on PR:
```bash
archmap check $(git diff --name-only main) --json
# Non-zero exit → apply requires-human-review label, surface blast radius
```

**Pre-commit hook:**
```bash
archmap check $(git diff --cached --name-only)
```
