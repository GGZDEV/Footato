const nf = (min: number, max: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });

const d0 = nf(0, 0);
const d1 = nf(1, 1);
const d2 = nf(2, 2);

/** Formats an amount held in thousands of euros, scaling the unit to keep tables readable. */
export function money(thousands: number, opts: { sign?: boolean; dash?: boolean } = {}): string {
  if (!thousands) return opts.dash === false ? '0' : '—';
  const abs = Math.abs(thousands);
  const prefix = opts.sign && thousands > 0 ? '+' : '';
  if (abs >= 1_000_000) return `${prefix}${d2.format(thousands / 1_000_000)} Md€`;
  if (abs >= 10_000) return `${prefix}${d0.format(thousands / 1_000)} M€`;
  return `${prefix}${d1.format(thousands / 1_000)} M€`;
}

export const count = (n: number) => d0.format(n);

/** 2003 -> "2003/04" */
export function season(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

export const windowLabel = (w: number) => (w === 1 ? 'Hiver' : 'Été');
export const windowShort = (w: number) => (w === 1 ? 'H' : 'É');

/** The calendar year a window actually took place in — winter 2003/04 is January 2004. */
export const windowYear = (year: number, w: number) => (w === 1 ? year + 1 : year);

export function mercatoLabel(year: number, w: number): string {
  return `${season(year)} · ${windowLabel(w)}`;
}
