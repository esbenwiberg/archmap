import { loadConfig } from "../config.js";
import { classifyFile } from "../classify.js";
import { getFreshTopology } from "../cache.js";
import { buildTopology } from "../graph.js";
import { buildChurnMap } from "../churn.js";
import { computeRiskScores } from "../risk.js";
import type { Classification } from "../classify.js";

export async function classifyCommand(
  file: string,
  opts: { json?: boolean; config?: string }
): Promise<void> {
  const config = loadConfig(opts.config);
  const entry = config.analyzers.find((a) => a.lang === "typescript")?.entry ?? "src/";
  const { topology, cacheHit } = await getFreshTopology(entry, buildTopology);

  if (!opts.json) {
    process.stderr.write(cacheHit ? "(cache hit)\n" : "(topology rebuilt)\n");
  }

  const churnMap = buildChurnMap();
  const riskScores = computeRiskScores(topology, churnMap);
  const result: Classification = classifyFile(file, topology, config, riskScores);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const instPct = (result.instability * 100).toFixed(0);
    console.log(`${result.file}`);
    console.log(`  class:       ${result.class}${result.overridden ? " (overridden)" : ""}`);
    console.log(`  ca:          ${result.ca} direct, ${result.tca} transitive`);
    console.log(`  instability: ${instPct}%`);
    if (result.risk) {
      console.log(`  risk:        ${result.risk.risk}/100  (structural=${result.risk.structural}, churn=${result.risk.commits} commits/90d)`);
    }
    console.log(`  reason:      ${result.reason}`);
  }
}
