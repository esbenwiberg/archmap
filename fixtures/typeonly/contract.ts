// Pure type contract — imported ONLY via `import type` by 3 consumers.
// Without tsPreCompilationDeps, dependency-cruiser drops these edges and this
// file reads as Ca=0 (leaf). With it, Ca=3 (hub-ish). Mirrors a real
// ports-and-adapters `types.ts`.
export interface Contract {
  id: string;
  value: number;
}
