import type { Dataset, FreshnessData, LatestData, League, Mercato, Meta, Movement, ServerStatus, Window } from './types';

interface RawSummary {
  meta: Meta;
  leagues: League[];
  clubs: string[];
  rows: number[][];
}

const asset = (path: string) => `${import.meta.env.BASE_URL}data/${path}`.replace(/\/{2,}/g, '/');

/** Column layout of a summary row, mirroring scripts/build-dataset.mjs. */
const C = {
  club: 0, league: 1, year: 2, window: 3,
  spend: 4, income: 5, loanSpend: 6, loanIncome: 7,
  in: 8, out: 14,
} as const;

const counts = (r: number[], base: number) => ({
  total: r[base],
  paid: r[base + 1],
  free: r[base + 2],
  loan: r[base + 3],
  undisclosed: r[base + 4],
  freeOrLoan: r[base + 5] ?? 0,
  notApplicable: r[base === C.in ? 20 : 21] ?? 0,
  loanFee: r[base === C.in ? 22 : 23] ?? 0,
});

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch(asset('summary.json'));
  if (!res.ok) throw new Error(`Chargement des données impossible (HTTP ${res.status})`);
  const raw: RawSummary = await res.json();

  const mercatos = raw.rows.map((r): Mercato => ({
    key: `${r[C.club]}-${r[C.year]}-${r[C.window]}`,
    clubId: r[C.club],
    club: raw.clubs[r[C.club]],
    league: raw.leagues[r[C.league]],
    year: r[C.year],
    window: r[C.window] as Window,
    spend: r[C.spend],
    income: r[C.income],
    loanSpend: r[C.loanSpend],
    loanIncome: r[C.loanIncome],
    arrivals: counts(r, C.in),
    departures: counts(r, C.out),
  }));

  return { meta: raw.meta, leagues: raw.leagues, clubs: raw.clubs, mercatos };
}

/** Loads the latest published roster check. It is deliberately separate from financial aggregates. */
export async function loadFreshness(cacheBust = false): Promise<FreshnessData | null> {
  try {
    const suffix = cacheBust ? `?t=${Date.now()}` : '';
    const res = await fetch(`${asset('freshness.json')}${suffix}`, cacheBust ? { cache: 'no-store' } : undefined);
    if (!res.ok) return null;
    return await res.json() as FreshnessData;
  } catch {
    return null;
  }
}

/**
 * Loads the recent-transfer check. Like the roster radar it is deliberately
 * separate from the aggregates: it reports what the data does and does not
 * contain, and never contributes an amount.
 */
export async function loadLatest(cacheBust = false): Promise<LatestData | null> {
  try {
    const suffix = cacheBust ? `?t=${Date.now()}` : '';
    const res = await fetch(`${asset('latest.json')}${suffix}`, cacheBust ? { cache: 'no-store' } : undefined);
    if (!res.ok) return null;
    return await res.json() as LatestData;
  } catch {
    return null;
  }
}

/**
 * Detects the self-hosted refresh service. Returns null on a static host, where
 * /api/status simply does not exist — the page then hides the controls rather
 * than offering a button nothing can answer.
 */
export async function loadServerStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json() as ServerStatus;
    return typeof body?.refreshEnabled === 'boolean' ? body : null;
  } catch {
    return null;
  }
}

/** Asks the service for a collection. The token never leaves the browser except as a bearer. */
export async function triggerRefresh(token: string, mode: 'light' | 'full' = 'light'): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`/api/refresh?mode=${mode}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({})) as { error?: string };
    if (res.status === 202) return { ok: true, message: 'Collecte lancée' };
    return { ok: false, message: body.error ?? `Refusé (HTTP ${res.status})` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

const detailCache = new Map<string, Promise<Movement[]>>();

/** Loads the individual movements of one league's window, on demand. */
export function loadWindow(leagueId: string, year: number, window: Window, clubs: string[]): Promise<Movement[]> {
  const key = `${leagueId}_${year}_${window}`;
  let pending = detailCache.get(key);
  if (!pending) {
    pending = fetch(asset(`windows/${key}.json`))
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: number[][]) =>
        (rows as unknown as [number, 0 | 1, number, number, string, string][]).map(
          ([clubId, dir, kind, amount, player, counterpart]): Movement => ({
            clubId, dir, kind, amount, player, counterpart,
            club: clubs[clubId],
          }),
        ),
      )
      .catch(() => [] as Movement[]);
    detailCache.set(key, pending);
  }
  return pending;
}
