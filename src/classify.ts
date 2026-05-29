import type { ArchmapConfig } from "./config.js";
import { matchOverride } from "./config.js";
import type { Topology } from "./graph.js";
import type { RiskScore } from "./risk.js";

export type Klass = "leaf" | "branch" | "hub";

export interface Classification {
  file: string;
  class: Klass;
  ca: number;
  tca: number;
  instability: number;
  risk: RiskScore | null;
  reason: string;
  overridden: boolean;
}

export function classifyFile(
  file: string,
  topology: Topology,
  config: ArchmapConfig,
  riskScores?: Map<string, RiskScore>
): Classification {
  const riskScore = riskScores?.get(file) ?? null;
  const override = matchOverride(file, config.overrides);

  if (override) {
    const node = topology.files[file];
    const ca = node?.ca ?? 0;
    const tca = node?.tca ?? 0;
    const ce = node?.ce ?? 0;
    const total = ca + ce;
    return {
      file,
      class: override.classification,
      ca,
      tca,
      instability: total === 0 ? 0 : ce / total,
      risk: riskScore,
      reason: override.reason,
      overridden: true,
    };
  }

  const node = topology.files[file];
  if (!node) {
    process.stderr.write(
      `warning: "${file}" not found in dependency graph — treating as leaf\n`
    );
    return {
      file,
      class: "leaf",
      ca: 0,
      tca: 0,
      instability: 0,
      risk: riskScore,
      reason: "not in dependency graph",
      overridden: false,
    };
  }

  const { ca, tca, ce } = node;
  const total = ca + ce;
  const instability = total === 0 ? 0 : ce / total;

  let klass: Klass;
  if (ca <= config.thresholds.leaf) {
    klass = "leaf";
  } else if (ca <= config.thresholds.junction) {
    klass = "branch";
  } else {
    klass = "hub";
  }

  return {
    file,
    class: klass,
    ca,
    tca,
    instability,
    risk: riskScore,
    reason: `Ca=${ca} (${ca} direct, ${tca} transitive)`,
    overridden: false,
  };
}
