import { describe, it, expect } from "vitest";
import { buildTopology } from "../graph.js";

describe("buildTopology", () => {
  it("computes Ca correctly for fixture files", async () => {
    const topology = await buildTopology("fixtures/src/");

    // utils.ts is imported by 12 direct consumers + service.ts = 13
    expect(topology.files["fixtures/src/utils.ts"].ca).toBe(13);
    // helper.ts is imported by 1 consumer
    expect(topology.files["fixtures/src/helper.ts"].ca).toBe(1);
    // service.ts is imported by 5 consumers
    expect(topology.files["fixtures/src/service.ts"].ca).toBe(5);
  });

  it("computes Ce (efferent coupling) correctly", async () => {
    const topology = await buildTopology("fixtures/src/");

    // utils.ts imports nothing
    expect(topology.files["fixtures/src/utils.ts"].ce).toBe(0);
    // service.ts imports utils.ts
    expect(topology.files["fixtures/src/service.ts"].ce).toBe(1);
  });

  it("lists dependents correctly", async () => {
    const topology = await buildTopology("fixtures/src/");

    const helpDeps = topology.files["fixtures/src/helper.ts"].dependents;
    expect(helpDeps).toHaveLength(1);
    expect(helpDeps[0]).toBe("fixtures/src/consumer_helper_1.ts");
  });
});
