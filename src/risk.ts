import type { Topology } from "./graph.js";
import type { ChurnData } from "./churn.js";

export interface RiskScore {
  risk: number;
  structural: number;
  churn: number;
  tca: number;
  commits: number;
}

export function computeRiskScores(
  topology: Topology,
  churnMap: Map<string, ChurnData>
): Map<string, RiskScore> {
  const files = Object.keys(topology.files);

  // raw scores per file
  const raws = new Map<string, { structural: number; churn: number; tca: number; commits: number }>();
  for (const file of files) {
    const node = topology.files[file];
    const commits = churnMap.get(file)?.commits ?? 0;
    const structural = Math.log1p(node.ca) + 1.5 * Math.log1p(node.tca);
    const churnRaw = Math.log1p(commits);
    raws.set(file, { structural, churn: churnRaw, tca: node.tca, commits });
  }

  // combined raw risk
  const rawRisks: Array<{ file: string; raw: number }> = [];
  for (const [file, r] of raws) {
    rawRisks.push({ file, raw: 0.6 * r.structural + 0.4 * r.churn });
  }
  rawRisks.sort((a, b) => a.raw - b.raw);

  // percentile rank (0–100), ties share same percentile
  const scores = new Map<string, RiskScore>();
  const n = rawRisks.length;
  for (let i = 0; i < n; i++) {
    const { file, raw } = rawRisks[i];
    const r = raws.get(file)!;
    // count how many have strictly lower raw risk
    const rank = rawRisks.filter((x) => x.raw < raw).length;
    const percentile = n === 1 ? 50 : Math.round((rank / (n - 1)) * 100);
    scores.set(file, {
      risk: percentile,
      structural: Math.round(r.structural * 100) / 100,
      churn: Math.round(r.churn * 100) / 100,
      tca: r.tca,
      commits: r.commits,
    });
  }

  return scores;
}
