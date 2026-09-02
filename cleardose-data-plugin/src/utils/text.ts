export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return typeof value === 'string' && value.trim() ? [value] : [];
}

export function uniq(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((x): x is string => Boolean(x && x.trim())).map(x => x.trim()))];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stableId(prefix: string, value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}-${(h >>> 0).toString(36)}`;
}
