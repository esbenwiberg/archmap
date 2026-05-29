import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import type { Topology } from "./graph.js";
import { listTypeScriptFiles } from "./files.js";

const CACHE_DIR = ".archmap";
const CACHE_FILE = `${CACHE_DIR}/cache.json`;

interface CacheEntry {
  hash: string;
  topology: Topology;
}

function computeStructureHash(entry: string): string {
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

export function readCache(): CacheEntry | null {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

export function writeCache(hash: string, topology: Topology): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify({ hash, topology }, null, 2));
}

export async function getFreshTopology(
  entry: string,
  buildFn: (entry: string) => Promise<Topology>
): Promise<{ topology: Topology; cacheHit: boolean }> {
  const hash = computeStructureHash(entry);
  const cached = readCache();
  if (cached && cached.hash === hash) {
    return { topology: cached.topology, cacheHit: true };
  }
  const topology = await buildFn(entry);
  writeCache(hash, topology);
  return { topology, cacheHit: false };
}
