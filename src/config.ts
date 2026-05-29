import { readFileSync } from "fs";
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
