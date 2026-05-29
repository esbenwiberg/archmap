import { resolveProject } from "../config.js";
import { getFreshTopology, getFreshChurn } from "../cache.js";
import { buildTopology } from "../graph.js";
import { buildChurnMap } from "../churn.js";
import { computeRiskScores } from "../risk.js";

export async function riskCommand(
  opts: { top?: string; json?: boolean; config?: string }
): Promise<void> {
  const { entry } = resolveProject(opts.config);
  const { topology } = await getFreshTopology(entry, buildTopology);

  const { churn: churnMap } = getFreshChurn(90, buildChurnMap);
  const riskScores = computeRiskScores(topology, churnMap);

  const n = opts.top ? parseInt(opts.top, 10) : 10;
  const sorted = [...riskScores.entries()]
    .sort((a, b) => b[1].risk - a[1].risk)
    .slice(0, n);

  if (opts.json) {
    console.log(
      JSON.stringify(
        sorted.map(([file, score]) => ({ file, ...score })),
        null,
        2
      )
    );
  } else {
    console.log(`Top ${sorted.length} riskiest files:\n`);
    for (const [file, score] of sorted) {
      const node = topology.files[file];
      console.log(
        `  ${score.risk.toString().padStart(3)}/100  ${file}`
      );
      console.log(
        `         ca=${node?.ca ?? 0}  tca=${score.tca}  churn=${score.commits}c/90d  structural=${score.structural}`
      );
    }
  }
}
