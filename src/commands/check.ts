import { resolveProject } from "../config.js";
import { classifyFile } from "../classify.js";
import { getFreshTopology, getFreshChurn } from "../cache.js";
import { buildTopology } from "../graph.js";
import { buildChurnMap } from "../churn.js";
import { computeRiskScores } from "../risk.js";
import type { Classification } from "../classify.js";

export async function checkCommand(
  files: string[],
  opts: { json?: boolean; config?: string }
): Promise<void> {
  const { config, entry } = resolveProject(opts.config);
  const { topology } = await getFreshTopology(entry, buildTopology);

  const { churn: churnMap } = getFreshChurn(90, buildChurnMap);
  const riskScores = computeRiskScores(topology, churnMap);

  const results: Classification[] = files.map((f) =>
    classifyFile(f, topology, config, riskScores)
  );
  const hubs = results.filter((r) => r.class === "hub");
  const hasHubs = hubs.length > 0;

  if (opts.json) {
    console.log(JSON.stringify({ hasHubs, hubs, all: results }, null, 2));
  } else {
    if (hasHubs) {
      console.log(`load-bearing (hub) files detected:`);
      for (const h of hubs) {
        const riskLabel = h.risk ? `  risk=${h.risk.risk}/100` : "";
        console.log(`  ${h.file}  Ca=${h.ca} (${h.tca} transitive)${riskLabel}`);
      }
    } else {
      console.log("No hub files in changeset.");
    }
  }

  if (hasHubs) process.exit(1);
}
