import { writeFileSync, mkdirSync } from "fs";
import { buildTopology } from "../graph.js";
import { writeCache } from "../cache.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { listTypeScriptFiles } from "../files.js";

export async function scanCommand(
  entry: string,
  opts: { json?: boolean }
): Promise<void> {
  const topology = await buildTopology(entry);

  mkdirSync(".archmap", { recursive: true });
  writeFileSync(".archmap/topology.json", JSON.stringify(topology, null, 2));

  // update cache
  const hash = computeHash(entry);
  writeCache(hash, topology);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, files: Object.keys(topology.files).length }));
  } else {
    console.log(`Scanned ${Object.keys(topology.files).length} files → .archmap/topology.json`);
  }
}

function computeHash(entry: string): string {
  const files = listTypeScriptFiles(entry);
  const hasher = createHash("sha256");
  for (const file of files) {
    hasher.update(file + "\n");
    try {
      const src = readFileSync(file, "utf8");
      const imports = src.match(/^(import|export).*from\s+['"].*['"]/gm) ?? [];
      hasher.update(imports.join("\n") + "\n");
    } catch {
      // skip unreadable files
    }
  }
  return hasher.digest("hex");
}
