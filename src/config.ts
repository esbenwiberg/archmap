import { readFileSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { parse } from "yaml";
import micromatch from "micromatch";
import type { Klass } from "./classify.js";

export interface Override {
  path: string;
  classification: Klass;
  reason: string;
}

export interface ArchmapConfig {
  version: number;
  thresholds: {
    leaf: number;
    junction: number;
  };
  overrides: Override[];
  analyzers: Array<{ lang: string; entry: string }>;
}

const DEFAULTS: ArchmapConfig = {
  version: 1,
  thresholds: { leaf: 2, junction: 10 },
  overrides: [],
  analyzers: [{ lang: "typescript", entry: "src/" }],
};

export function loadConfig(configPath = ".archmap.yaml"): ArchmapConfig {
  let raw: Partial<ArchmapConfig> = {};
  try {
    raw = parse(readFileSync(configPath, "utf8")) ?? {};
  } catch {
    // no config file — use defaults
  }

  const config: ArchmapConfig = {
    version: raw.version ?? DEFAULTS.version,
    thresholds: {
      leaf: raw.thresholds?.leaf ?? DEFAULTS.thresholds.leaf,
      junction: raw.thresholds?.junction ?? DEFAULTS.thresholds.junction,
    },
    overrides: raw.overrides ?? [],
    analyzers: raw.analyzers ?? DEFAULTS.analyzers,
  };

  for (const ov of config.overrides) {
    if (!["leaf", "branch", "hub"].includes(ov.classification)) {
      throw new Error(
        `Invalid classification "${ov.classification}" in overrides for path "${ov.path}"`
      );
    }
  }

  return config;
}

/**
 * Walk up from `startDir` to the filesystem root looking for `.archmap.yaml`.
 * Returns the absolute path to the nearest config, or null if none is found.
 */
export function findConfigPath(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, ".archmap.yaml");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

export interface ResolvedProject {
  config: ArchmapConfig;
  entry: string;
  root: string;
  configPath: string | null;
}

/**
 * Resolve the project context for a command.
 *
 * - With an explicit `--config` path: legacy behaviour — the config is loaded
 *   as given and `entry` paths resolve relative to the current working dir.
 * - Without one: walk up from cwd to discover the nearest `.archmap.yaml`,
 *   chdir into its directory (the project root), and resolve `entry` paths
 *   relative to that directory. This lets `archmap` be run from any
 *   subdirectory of a project and still analyse the whole tree.
 */
export function resolveProject(explicitConfig?: string): ResolvedProject {
  let configPath: string | null = null;
  let root = process.cwd();

  if (explicitConfig) {
    configPath = explicitConfig;
  } else {
    configPath = findConfigPath();
    if (configPath) {
      root = dirname(resolve(configPath));
      if (root !== process.cwd()) process.chdir(root);
    }
  }

  const config = loadConfig(configPath ?? undefined);
  const entry =
    config.analyzers.find((a) => a.lang === "typescript")?.entry ?? "src/";
  return { config, entry, root, configPath };
}

export function matchOverride(
  file: string,
  overrides: Override[]
): Override | undefined {
  for (const ov of overrides) {
    if (micromatch.isMatch(file, ov.path, { dot: true })) {
      return ov;
    }
  }
  return undefined;
}
