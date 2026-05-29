import { describe, it, expect } from "vitest";
import { computeRiskScores } from "../risk.js";
import type { Topology } from "../graph.js";

function makeTopology(entries: Array<{ file: string; ca: number; tca: number; ce?: number }>): Topology {
  const files: Topology["files"] = {};
  for (const e of entries) {
    files[e.file] = {
      ca: e.ca,
      tca: e.tca,
      ce: e.ce ?? 0,
      dependents: [],
    };
  }
  return { files };
}

describe("computeRiskScores", () => {
  it("highest Ca+tca file gets highest risk percentile", () => {
    const topology = makeTopology([
      { file: "hub.ts", ca: 15, tca: 50 },
      { file: "branch.ts", ca: 5, tca: 10 },
      { file: "leaf.ts", ca: 1, tca: 1 },
    ]);
    const scores = computeRiskScores(topology, new Map());
    expect(scores.get("hub.ts")!.risk).toBeGreaterThan(scores.get("branch.ts")!.risk);
    expect(scores.get("branch.ts")!.risk).toBeGreaterThan(scores.get("leaf.ts")!.risk);
  });

  it("highest churn file gets higher risk than structural equal with no churn", () => {
    const topology = makeTopology([
      { file: "a.ts", ca: 5, tca: 5 },
      { file: "b.ts", ca: 5, tca: 5 },
    ]);
    const churnMap = new Map([["a.ts", { commits: 20, windowDays: 90 }]]);
    const scores = computeRiskScores(topology, churnMap);
    expect(scores.get("a.ts")!.risk).toBeGreaterThan(scores.get("b.ts")!.risk);
  });

  it("single file gets risk=50", () => {
    const topology = makeTopology([{ file: "only.ts", ca: 5, tca: 10 }]);
    const scores = computeRiskScores(topology, new Map());
    expect(scores.get("only.ts")!.risk).toBe(50);
  });

  it("risk is always in range 0–100", () => {
    const topology = makeTopology([
      { file: "a.ts", ca: 0, tca: 0 },
      { file: "b.ts", ca: 100, tca: 500 },
    ]);
    const scores = computeRiskScores(topology, new Map());
    for (const score of scores.values()) {
      expect(score.risk).toBeGreaterThanOrEqual(0);
      expect(score.risk).toBeLessThanOrEqual(100);
    }
  });
});

describe("computeRiskScores — transitive Ca", () => {
  it("higher tca increases structural score", () => {
    const topology = makeTopology([
      { file: "a.ts", ca: 5, tca: 0 },
      { file: "b.ts", ca: 5, tca: 50 },
    ]);
    const scores = computeRiskScores(topology, new Map());
    expect(scores.get("b.ts")!.structural).toBeGreaterThan(scores.get("a.ts")!.structural);
    expect(scores.get("b.ts")!.risk).toBeGreaterThan(scores.get("a.ts")!.risk);
  });
});
