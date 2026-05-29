import { createHash } from "crypto";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import type { Topology } from "./graph.js";
import type { ChurnData } from "./churn.js";
import { listTypeScriptFiles } from "./files.js";

const CACHE_DIR = ".archmap";
const CACHE_FILE = `${CACHE_DIR}/cache.json`;

interface ChurnCache {
  key: string; // `${headSha}:${windowDays}` — busts when HEAD or window changes
  entries: Array<[string, ChurnData]>;
}

interface CacheEntry {
  hash: string;
  topology: Topology;
  churn?: ChurnCache;
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

function writeCacheEntry(entry: CacheEntry): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(entry, null, 2));
}

/** Persist topology under a structure hash, preserving any cached churn. */
export function writeCache(hash: string, topology: Topology): void {
  const existing = readCache();
  writeCacheEntry({ hash, topology, churn: existing?.churn });
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

function gitHead(): string {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "nogit";
  }
}

/**
 * Return the churn map, reusing the cached one when git HEAD and the window
 * are unchanged. Churn is keyed on HEAD (not the structure hash) because it
 * derives from commit history, not import structure — so editing a file body
 * doesn't bust it, but a new commit does.
 */
export function getFreshChurn(
  windowDays: number,
  buildFn: (windowDays: number) => Map<string, ChurnData>
): { churn: Map<string, ChurnData>; cacheHit: boolean } {
  const key = `${gitHead()}:${windowDays}`;
  const cached = readCache();
  if (cached?.churn && cached.churn.key === key) {
    return { churn: new Map(cached.churn.entries), cacheHit: true };
  }
  const churn = buildFn(windowDays);
  const base: CacheEntry = cached ?? { hash: "", topology: { files: {} } };
  writeCacheEntry({ ...base, churn: { key, entries: [...churn] } });
  return { churn, cacheHit: false };
}
