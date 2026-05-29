import { loadConfig } from "../config.js";
import { classifyFile } from "../classify.js";
import { getFreshTopology } from "../cache.js";
import { buildTopology } from "../graph.js";

export async function explainCommand(
  file: string,
  opts: { json?: boolean; config?: string }
): Promise<void> {
  const config = loadConfig(opts.config);
  const entry = config.analyzers.find((a) => a.lang === "typescript")?.entry ?? "src/";
  const { topology } = await getFreshTopology(entry, buildTopology);

  const node = topology.files[file];
  const classification = classifyFile(file, topology, config);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          file,
          classification,
          dependents: node?.dependents ?? [],
        },
        null,
        2
      )
    );
  } else {
    console.log(`${file}`);
    console.log(`  class:     ${classification.class}${classification.overridden ? " (overridden)" : ""}`);
    console.log(`  reason:    ${classification.reason}`);
    console.log(`  ca:        ${classification.ca} (${classification.ca} file${classification.ca === 1 ? "" : "s"} depend on this)`);
    const deps = node?.dependents ?? [];
    if (deps.length === 0) {
      console.log("  dependents: none");
    } else {
      console.log("  dependents:");
      for (const d of deps) {
        console.log(`    ${d}`);
      }
    }
  }
}
