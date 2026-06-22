import { describe, expect, it, vi } from "vitest";

const { cruiseMock } = vi.hoisted(() => ({
  cruiseMock: vi.fn(),
}));

vi.mock("dependency-cruiser", () => ({
  cruise: cruiseMock,
}));

import { buildTopology } from "../graph.js";

describe("buildTopology — graph inversion", () => {
  it("derives dependents and Ca from dependency edges when cruiser omits dependents", async () => {
    cruiseMock.mockResolvedValueOnce({
      output: {
        modules: [
          {
            source: "src/a.ts",
            dependencies: [
              { resolved: "src/shared.ts", coreModule: false },
              { resolved: "node_modules/pkg/index.js", coreModule: false },
              { resolved: "fs", coreModule: true },
            ],
          },
          {
            source: "src/b.ts",
            dependencies: [
              { resolved: "src/shared.ts", coreModule: false },
            ],
          },
          {
            source: "src/shared.ts",
            dependencies: [],
          },
        ],
      },
    });

    const topology = await buildTopology("src/");

    expect(topology.files["src/shared.ts"].ca).toBe(2);
    expect(topology.files["src/shared.ts"].dependents).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });
});
