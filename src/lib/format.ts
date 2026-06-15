// Shared display helpers.

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${value.toFixed(2)}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// The effective wholesale (regular) price a member is compared against: the
// promo-discounted wholesale price if one applies, otherwise the base.
export function regularWholesale(p: {
  wholesale_price: number | null;
  wholesale_final?: number | null;
}): number | null {
  if (p.wholesale_final !== null && p.wholesale_final !== undefined) return p.wholesale_final;
  return p.wholesale_price;
}
