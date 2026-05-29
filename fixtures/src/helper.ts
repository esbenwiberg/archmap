// helper — imported by 1 consumer (leaf)
export function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "-");
}
