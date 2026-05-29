import { readdirSync, statSync } from "fs";
import { join } from "path";

const TS_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".archmap"]);

export function listTypeScriptFiles(entry: string): string[] {
  const files: string[] = [];

  function walk(path: string): void {
    let stat;
    try {
      stat = statSync(path);
    } catch {
      return;
    }

    if (stat.isDirectory()) {
      for (const child of readdirSync(path)) {
        if (!SKIP_DIRS.has(child)) {
          walk(join(path, child));
        }
      }
      return;
    }

    if (stat.isFile() && TS_FILE.test(path) && !TEST_FILE.test(path)) {
      files.push(path);
    }
  }

  walk(entry);
  return files.sort();
}
