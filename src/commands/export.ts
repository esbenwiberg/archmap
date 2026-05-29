import { execSync } from "child_process";
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
 */
export interface ExportArtifact {
  version: 1;
  commit: string | null;
  generatedAt: string;
  files: Record<string, ExportedFile>;
}

/**
 * Pure transform: topology + config + risk → a fully-classified artifact.
 * No git, no graph build, no I/O — so it is trivially unit-testable.
 */
export function buildExportArtifact(
  topology: Topology,
  config: ArchmapConfig,
  riskScores: Map<string, RiskScore>,
  commit: string | null,
  now: Date = new Date()
): ExportArtifact {
  const files: Record<string, ExportedFile> = {};
  for (const file of Object.keys(topology.files)) {
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
  return { version: 1, commit, generatedAt: now.toISOString(), files };
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

export async function exportCommand(opts: { config?: string }): Promise<void> {
  const { config, entry } = resolveProject(opts.config);
  const { topology } = await getFreshTopology(entry, buildTopology);
  const { churn: churnMap } = getFreshChurn(90, buildChurnMap);
  const riskScores = computeRiskScores(topology, churnMap);

  const artifact = buildExportArtifact(topology, config, riskScores, currentCommit());

  // export is inherently machine-readable: always emit JSON on stdout.
  console.log(JSON.stringify(artifact, null, 2));
}
