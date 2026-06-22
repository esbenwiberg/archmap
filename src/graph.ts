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
    // Count `import type` / type-only edges. Without this, dependency-cruiser
    // drops type-only imports, so a pure type contract (e.g. a ports-and-
    // adapters `types.ts` imported only via `import type`) reads as Ca=0 →
    // misclassified as a leaf. For a review-gating tool, a published type
    // contract is exactly when a human IS needed, so type edges must count.
    tsPreCompilationDeps: true,
  });

  const modules = (result.output as any).modules as Array<{
    source: string;
    coreModule?: boolean;
    dependencies: Array<{ resolved?: string; coreModule?: boolean }>;
  }>;

  const files: Topology["files"] = {};
  for (const m of modules) {
    // Skip non-repo modules: Node core (fs, path, …) and externals under
    // node_modules. They surface as leaf nodes in the cruise output but are
    // not files we classify, and counting them pollutes risk rankings.
    if (m.coreModule || m.source.includes("node_modules/")) continue;
    const ce = m.dependencies.filter((d) => !d.coreModule).length;
    files[m.source] = { ca: 0, ce, tca: 0, dependents: [] };
  }

  // Derive fan-in from forward edges instead of trusting dependency-cruiser's
  // optional `dependents` field; Ca is the core signal archmap gates on.
  for (const m of modules) {
    if (!files[m.source]) continue;

    const seenDependencies = new Set<string>();
    for (const dependency of m.dependencies) {
      if (dependency.coreModule || !dependency.resolved) continue;
      if (dependency.resolved === m.source) continue;
      if (seenDependencies.has(dependency.resolved)) continue;
      seenDependencies.add(dependency.resolved);

      const target = files[dependency.resolved];
      if (!target) continue;
      target.dependents.push(m.source);
    }
  }

  for (const file of Object.keys(files)) {
    files[file].ca = files[file].dependents.length;
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
