// shared utility — imported by 12 consumers (hub)
export function formatDate(d: Date): string {
  return d.toISOString();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
