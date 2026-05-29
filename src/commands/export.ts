import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolveProject } from "../config.js";
import { classifyFile } from "../classify.js";
import { getFreshTopology, getFreshChurn } from "../cache.js";
import { buildTopology } from "../graph.js";
import { buildChurnMap } from "../churn.js";
import { computeRiskScores } from "../risk.js";
import type { ArchmapConfig } from "../config.js";
import type { Topology } from "../graph.js";
import type { RiskScore } from "../risk.js";
import type { Klass } from "../classify.js";

/** One file's fully-resolved verdict — everything an external consumer needs. */
export interface ExportedFile {
  class: Klass;
  ca: number;
  tca: number;
  instability: number;
  risk: number | null; // percentile rank (0–100), null if no risk data
  overridden: boolean;
  reason: string;
  dependents: string[]; // the off-diff blast radius
}

/**
 * Self-contained artifact for consumers that have no source tree (e.g. a
 * hosted diff-only review bot). Keyed by `commit` so a consumer can verify it
 * matches the PR head SHA before trusting the lookups.
 *
 * When built with a `scope` (the PR's changed paths), `files` is narrowed to
 * just those paths — each still carrying its full `dependents` blast radius —
 * and the `scope` block records which requested paths were not in the graph,
 * so a missed lookup is loud rather than silent.
 */
export interface ExportArtifact {
  version: 1;
  commit: string | null;
  generatedAt: string;
  scope?: { requested: string[]; missing: string[] };
  files: Record<string, ExportedFile>;
}

/** Normalize an incoming path to the form dependency-cruiser uses as keys. */
function normalizePath(p: string): string {
  return p.trim().replace(/^\.\//, "");
}

/**
 * Pure transform: topology + config + risk → a fully-classified artifact.
 * No git, no graph build, no I/O — so it is trivially unit-testable.
 *
 * If `scope` is given, the graph is still built whole-repo (the caller does
 * that), but the emitted `files` map is narrowed to the in-scope paths.
 */
export function buildExportArtifact(
  topology: Topology,
  config: ArchmapConfig,
  riskScores: Map<string, RiskScore>,
  commit: string | null,
  scope?: string[],
  now: Date = new Date()
): ExportArtifact {
  const keys =
    scope === undefined
      ? Object.keys(topology.files)
      : scope.map(normalizePath).filter((p) => p in topology.files);

  const files: Record<string, ExportedFile> = {};
  for (const file of keys) {
    const c = classifyFile(file, topology, config, riskScores);
    files[file] = {
      class: c.class,
      ca: c.ca,
      tca: c.tca,
      instability: c.instability,
      risk: c.risk?.risk ?? null,
      overridden: c.overridden,
      reason: c.reason,
      dependents: topology.files[file].dependents,
    };
  }

  const artifact: ExportArtifact = {
    version: 1,
    commit,
    generatedAt: now.toISOString(),
    files,
  };
  if (scope !== undefined) {
    const requested = scope.map(normalizePath).filter((p) => p.length > 0);
    artifact.scope = {
      requested,
      missing: requested.filter((p) => !(p in topology.files)),
    };
  }
  return artifact;
}

function currentCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Read a newline-delimited path list from a file, or from stdin when "-". */
function readScope(source: string): string[] {
  const raw = readFileSync(source === "-" ? 0 : source, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export async function exportCommand(opts: { config?: string; scope?: string }): Promise<void> {
  const { config, entry } = resolveProject(opts.config);
  const { topology } = await getFreshTopology(entry, buildTopology);
  const { churn: churnMap } = getFreshChurn(90, buildChurnMap);
  const riskScores = computeRiskScores(topology, churnMap);

  const scope = opts.scope !== undefined ? readScope(opts.scope) : undefined;
  const artifact = buildExportArtifact(topology, config, riskScores, currentCommit(), scope);

  // export is inherently machine-readable: always emit JSON on stdout.
  console.log(JSON.stringify(artifact, null, 2));
}
