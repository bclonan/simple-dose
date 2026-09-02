/** Convert common 10-digit NDC package formats to the 11-digit billing form. */
export function normalizeNdc11(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;

  if (/^\d{11}$/.test(raw)) return raw;

  const parts = raw.split('-').map(p => p.replace(/\D/g, ''));
  if (parts.length === 3) {
    const [labeler, product, pkg] = parts;
    if (!labeler || !product || !pkg) return undefined;
    if (labeler.length === 4 && product.length === 4 && pkg.length === 2) {
      return `0${labeler}${product}${pkg}`;
    }
    if (labeler.length === 5 && product.length === 3 && pkg.length === 2) {
      return `${labeler}0${product}${pkg}`;
    }
    if (labeler.length === 5 && product.length === 4 && pkg.length === 1) {
      return `${labeler}${product}0${pkg}`;
    }
  }

  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? digits : undefined;
}

export function normalizeManyNdcs(values: string[]): string[] {
  return [...new Set(values.map(normalizeNdc11).filter((x): x is string => Boolean(x)))];
}
