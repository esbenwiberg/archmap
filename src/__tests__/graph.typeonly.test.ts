import { describe, it, expect } from "vitest";
import { buildTopology } from "../graph.js";

// Regression guard for tsPreCompilationDeps: true in buildTopology.
// `contract.ts` is imported ONLY via `import type` by three consumers. If
// type-only edges are dropped (the dependency-cruiser default), Ca collapses
// to 0 and a real type contract misclassifies as a leaf — the reviewer would
// wave through changes to a file that warrants human eyes.
describe("buildTopology — type-only imports", () => {
  it("counts `import type` edges toward Ca", async () => {
    const topology = await buildTopology("fixtures/typeonly/");

    expect(topology.files["fixtures/typeonly/contract.ts"].ca).toBe(3);
    expect(
      topology.files["fixtures/typeonly/contract.ts"].dependents,
    ).toEqual(
      expect.arrayContaining([
        "fixtures/typeonly/consumer_type_1.ts",
        "fixtures/typeonly/consumer_type_2.ts",
        "fixtures/typeonly/consumer_type_3.ts",
      ]),
    );
  });
});
