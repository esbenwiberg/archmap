import { loadConfig } from "../config.js";
import { getFreshTopology } from "../cache.js";
import { buildTopology } from "../graph.js";
import { buildChurnMap } from "../churn.js";
import { computeRiskScores } from "../risk.js";

export async function riskCommand(
  opts: { top?: string; json?: boolean; config?: string }
): Promise<void> {
  const config = loadConfig(opts.config);
  const entry = config.analyzers.find((a) => a.lang === "typescript")?.entry ?? "src/";
  const { topology } = await getFreshTopology(entry, buildTopology);

  const churnMap = buildChurnMap();
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
