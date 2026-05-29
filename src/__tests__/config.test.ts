import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { findConfigPath, resolveProject } from "../config.js";

describe("findConfigPath", () => {
  let root: string;
  const cwd = process.cwd();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "archmap-cfg-"));
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("finds .archmap.yaml in the current directory", () => {
    writeFileSync(join(root, ".archmap.yaml"), "version: 1\n");
    expect(findConfigPath(root)).toBe(join(root, ".archmap.yaml"));
  });

  it("walks up to find a config in an ancestor directory", () => {
    writeFileSync(join(root, ".archmap.yaml"), "version: 1\n");
    const nested = join(root, "src", "commands");
    mkdirSync(nested, { recursive: true });
    expect(findConfigPath(nested)).toBe(join(root, ".archmap.yaml"));
  });

  it("returns null when no config exists up to the filesystem root", () => {
    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(findConfigPath(nested)).toBeNull();
  });
});

describe("resolveProject", () => {
  let root: string;
  const cwd = process.cwd();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "archmap-proj-"));
  });
  afterEach(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  it("discovers config from a subdir and chdirs to the project root", () => {
    writeFileSync(
      join(root, ".archmap.yaml"),
      "version: 1\nanalyzers:\n  - lang: typescript\n    entry: lib/\n"
    );
    const nested = join(root, "src", "deep");
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    const { entry, configPath } = resolveProject();
    expect(entry).toBe("lib/");
    expect(configPath).toBe(join(root, ".archmap.yaml"));
    // chdir'd up to the config's directory
    expect(process.cwd()).toBe(root);
  });

  it("does not chdir when an explicit config path is given (legacy)", () => {
    process.chdir(root);
    writeFileSync(join(root, "custom.yaml"), "version: 1\n");
    const { entry } = resolveProject(join(root, "custom.yaml"));
    expect(entry).toBe("src/"); // default
    expect(process.cwd()).toBe(root);
  });
});
