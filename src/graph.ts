import { cruise } from "dependency-cruiser";

export interface FileNode {
  ca: number;
  ce: number;
  tca: number;
  dependents: string[];
}

export interface Topology {
  files: Record<string, FileNode>;
}

export async function buildTopology(entry: string): Promise<Topology> {
  const result = await cruise([entry], {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(test|spec)\\.tsx?$" },
  });

  const modules = (result.output as any).modules as Array<{
    source: string;
    dependencies: Array<{ resolved: string; coreModule?: boolean }>;
    dependents?: string[];
  }>;

  const files: Topology["files"] = {};
  for (const m of modules) {
    const ce = m.dependencies.filter((d) => !d.coreModule).length;
    const deps = m.dependents ?? [];
    files[m.source] = { ca: deps.length, ce, tca: 0, dependents: deps };
  }

  computeTransitiveCa(files);
  return { files };
}

function computeTransitiveCa(files: Topology["files"]): void {
  for (const file of Object.keys(files)) {
    const visited = new Set<string>();
    const queue = [file];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const dep of files[current]?.dependents ?? []) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
    // transitive Ca = all reachable dependents (excluding self)
    visited.delete(file);
    files[file].tca = visited.size;
  }
}
