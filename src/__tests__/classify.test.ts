import { describe, it, expect } from "vitest";
import { classifyFile } from "../classify.js";
import type { ArchmapConfig } from "../config.js";
import type { Topology } from "../graph.js";

const defaultConfig: ArchmapConfig = {
  version: 1,
  thresholds: { leaf: 2, junction: 10 },
  overrides: [],
  analyzers: [{ lang: "typescript", entry: "src/" }],
};

function makeTopology(file: string, ca: number, ce: number, tca = 0): Topology {
  return {
    files: {
      [file]: { ca, ce, tca, dependents: Array.from({ length: ca }, (_, i) => `dep${i}.ts`) },
    },
  };
}

describe("classifyFile — threshold boundaries", () => {
  const file = "src/a.ts";

  it("Ca=0 → leaf", () => {
    expect(classifyFile(file, makeTopology(file, 0, 0), defaultConfig).class).toBe("leaf");
  });

  it("Ca=2 (== leaf threshold) → leaf", () => {
    expect(classifyFile(file, makeTopology(file, 2, 0), defaultConfig).class).toBe("leaf");
  });

  it("Ca=3 (leaf+1) → branch", () => {
    expect(classifyFile(file, makeTopology(file, 3, 0), defaultConfig).class).toBe("branch");
  });

  it("Ca=10 (== junction threshold) → branch", () => {
    expect(classifyFile(file, makeTopology(file, 10, 0), defaultConfig).class).toBe("branch");
  });

  it("Ca=11 (junction+1) → hub", () => {
    expect(classifyFile(file, makeTopology(file, 11, 0), defaultConfig).class).toBe("hub");
  });
});

describe("classifyFile — instability", () => {
  const file = "src/a.ts";

  it("Ca=5 Ce=5 → instability=0.5", () => {
    const result = classifyFile(file, makeTopology(file, 5, 5), defaultConfig);
    expect(result.instability).toBeCloseTo(0.5);
  });

  it("Ca=0 Ce=0 → instability=0 (not NaN)", () => {
    const result = classifyFile(file, makeTopology(file, 0, 0), defaultConfig);
    expect(result.instability).toBe(0);
  });
});

describe("classifyFile — override precedence", () => {
  const file = "src/helper.ts";

  it("override always wins over computed class", () => {
    const config: ArchmapConfig = {
      ...defaultConfig,
      overrides: [{ path: "src/helper.ts", classification: "hub", reason: "security boundary" }],
    };
    const result = classifyFile(file, makeTopology(file, 1, 0), config);
    expect(result.class).toBe("hub");
    expect(result.overridden).toBe(true);
    expect(result.reason).toBe("security boundary");
  });

  it("glob override matches nested path", () => {
    const config: ArchmapConfig = {
      ...defaultConfig,
      overrides: [{ path: "src/**", classification: "hub", reason: "all src is hub" }],
    };
    const result = classifyFile("src/deep/file.ts", makeTopology("src/deep/file.ts", 0, 0), config);
    expect(result.class).toBe("hub");
    expect(result.overridden).toBe(true);
  });
});

describe("classifyFile — not in graph fallback", () => {
  it("returns leaf with warning reason when file not in topology", () => {
    const result = classifyFile("src/nonexistent.ts", { files: {} }, defaultConfig);
    expect(result.class).toBe("leaf");
    expect(result.reason).toBe("not in dependency graph");
    expect(result.overridden).toBe(false);
  });
});
