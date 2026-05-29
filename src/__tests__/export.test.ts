import { describe, it, expect } from "vitest";
import { buildExportArtifact } from "../commands/export.js";
import type { ArchmapConfig } from "../config.js";
import type { Topology } from "../graph.js";
import type { RiskScore } from "../risk.js";

const config: ArchmapConfig = {
  version: 1,
  thresholds: { leaf: 2, junction: 10 },
  overrides: [
    { path: "src/auth/TokenValidator.ts", classification: "hub", reason: "Security boundary" },
  ],
  analyzers: [{ lang: "typescript", entry: "src/" }],
};

const topology: Topology = {
  files: {
    "src/utils.ts": { ca: 12, ce: 0, tca: 30, dependents: ["src/a.ts", "src/b.ts"] },
    "src/helper.ts": { ca: 1, ce: 2, tca: 1, dependents: ["src/a.ts"] },
    "src/auth/TokenValidator.ts": { ca: 1, ce: 1, tca: 1, dependents: ["src/login.ts"] },
  },
};

const risk = new Map<string, RiskScore>([
  ["src/utils.ts", { risk: 100, structural: 8.4, churn: 3.1, tca: 30, commits: 22 }],
]);

describe("buildExportArtifact", () => {
  const artifact = buildExportArtifact(topology, config, risk, "abc123", new Date(0));

  it("stamps the commit and version", () => {
    expect(artifact.version).toBe(1);
    expect(artifact.commit).toBe("abc123");
    expect(artifact.generatedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("classifies every file in the topology", () => {
    expect(Object.keys(artifact.files).sort()).toEqual([
      "src/auth/TokenValidator.ts",
      "src/helper.ts",
      "src/utils.ts",
    ]);
    expect(artifact.files["src/utils.ts"].class).toBe("hub");
    expect(artifact.files["src/helper.ts"].class).toBe("leaf");
  });

  it("carries the off-diff blast radius (dependents)", () => {
    expect(artifact.files["src/utils.ts"].dependents).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("flattens risk to the percentile, null when absent", () => {
    expect(artifact.files["src/utils.ts"].risk).toBe(100);
    expect(artifact.files["src/helper.ts"].risk).toBeNull();
  });

  it("honors overrides", () => {
    const v = artifact.files["src/auth/TokenValidator.ts"];
    expect(v.class).toBe("hub");
    expect(v.overridden).toBe(true);
    expect(v.reason).toBe("Security boundary");
  });
});
