import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getFreshChurn } from "../cache.js";
import type { ChurnData } from "../churn.js";

describe("getFreshChurn", () => {
  let dir: string;
  const cwd = process.cwd();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "archmap-churn-"));
    process.chdir(dir); // cache writes to ./.archmap relative to cwd
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds churn on first call, reuses it on the second (same window)", () => {
    let calls = 0;
    const build = (windowDays: number): Map<string, ChurnData> => {
      calls++;
      return new Map([["a.ts", { commits: 3, windowDays }]]);
    };

    const first = getFreshChurn(90, build);
    expect(first.cacheHit).toBe(false);
    expect(first.churn.get("a.ts")!.commits).toBe(3);

    const second = getFreshChurn(90, build);
    expect(second.cacheHit).toBe(true);
    expect(second.churn.get("a.ts")!.commits).toBe(3);

    expect(calls).toBe(1); // git was not re-invoked
  });

  it("rebuilds when the window changes", () => {
    let calls = 0;
    const build = (windowDays: number): Map<string, ChurnData> => {
      calls++;
      return new Map([["a.ts", { commits: 1, windowDays }]]);
    };

    getFreshChurn(90, build);
    const other = getFreshChurn(30, build);
    expect(other.cacheHit).toBe(false);
    expect(calls).toBe(2);
  });
});
