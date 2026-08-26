import type { Mercato, Resolved } from './types';
import { mercatoLabel, season, windowLabel } from './format.ts';

export type Grouping = 'mercato' | 'club' | 'league' | 'season';
export type BalanceFilter = 'all' | 'positive' | 'negative';

export interface Filters {
  yearFrom: number;
  yearTo: number;
  window: 'all' | 0 | 1;
  leagues: string[];
  clubs: number[];
  balance: BalanceFilter;
  minVolume: number;
  includeLoanFees: boolean;
}

/** Applies the "include loan fees" setting to a mercato's raw amounts. */
export function resolve(m: Mercato, includeLoanFees: boolean): Resolved {
  const spend = m.spend + (includeLoanFees ? m.loanSpend : 0);
  const income = m.income + (includeLoanFees ? m.loanIncome : 0);
  return { spend, income, balance: income - spend, volume: spend + income };
}

export function filterMercatos(all: Mercato[], f: Filters): Mercato[] {
  const leagues = new Set(f.leagues);
  const clubs = new Set(f.clubs);

  return all.filter((m) => {
    if (m.year < f.yearFrom || m.year > f.yearTo) return false;
    if (f.window !== 'all' && m.window !== f.window) return false;
    if (leagues.size && !leagues.has(m.league.id)) return false;
    if (clubs.size && !clubs.has(m.clubId)) return false;

    const { balance, volume } = resolve(m, f.includeLoanFees);
    if (volume < f.minVolume) return false;
    if (f.balance === 'positive' && balance <= 0) return false;
    if (f.balance === 'negative' && balance >= 0) return false;
    return true;
  });
}

/** One line of the table: either a single mercato or an aggregate over several. */
export interface Group {
  key: string;
  label: string;
  sublabel: string;
  /** A Flag id: a country key, or 'summer' / 'winter'. */
  flag: string;
  spend: number;
  income: number;
  balance: number;
  volume: number;
  arrivals: number;
  departures: number;
  knownFees: number;
  unknownFees: number;
  /** Share of monetary fees found among found + explicitly unavailable fees (0..1). */
  coverage: number;
  titles?: number;
  domesticTitles?: number;
  continentalTitles?: number;
  spendPerTitle?: number;
  count: number;
  /** Present only when grouping by mercato — enables the detail drill-down. */
  mercato?: Mercato;
}

const empty = (key: string, label: string, sublabel: string, flag: string): Group => ({
  key, label, sublabel, flag,
  spend: 0, income: 0, balance: 0, volume: 0, arrivals: 0, departures: 0, count: 0,
  knownFees: 0, unknownFees: 0, coverage: 1,
});

const feeCoverage = (known: number, unknown: number) => known + unknown ? known / (known + unknown) : 1;

export function group(rows: Mercato[], grouping: Grouping, includeLoanFees: boolean): Group[] {
  if (grouping === 'mercato') {
    return rows.map((m) => {
      const r = resolve(m, includeLoanFees);
      return {
        key: m.key,
        label: m.club,
        sublabel: mercatoLabel(m.year, m.window),
        flag: m.league.code,
        ...r,
        arrivals: m.arrivals.total,
        departures: m.departures.total,
        knownFees: m.arrivals.paid + m.departures.paid
          + (includeLoanFees ? m.arrivals.loanFee + m.departures.loanFee : 0),
        unknownFees: m.arrivals.undisclosed + m.departures.undisclosed,
        coverage: feeCoverage(
          m.arrivals.paid + m.departures.paid
            + (includeLoanFees ? m.arrivals.loanFee + m.departures.loanFee : 0),
          m.arrivals.undisclosed + m.departures.undisclosed,
        ),
        count: 1,
        mercato: m,
      };
    });
  }

  const out = new Map<string, Group>();
  const latestClubWindow = new Map<string, [number, number]>();
  for (const m of rows) {
    let key: string, label: string, sublabel: string, flag: string;
    if (grouping === 'club') {
      key = String(m.clubId);
      label = m.club;
      sublabel = m.league.name;
      flag = m.league.code;
    } else if (grouping === 'league') {
      key = m.league.id;
      label = m.league.name;
      sublabel = m.league.country;
      flag = m.league.code;
    } else {
      key = `${m.year}-${m.window}`;
      label = season(m.year);
      sublabel = `Mercato d'${windowLabel(m.window).toLowerCase()}`;
      flag = m.window === 1 ? 'winter' : 'summer';
    }

    let g = out.get(key);
    if (!g) { g = empty(key, label, sublabel, flag); out.set(key, g); }

    const r = resolve(m, includeLoanFees);
    g.spend += r.spend;
    g.income += r.income;
    g.volume += r.volume;
    g.arrivals += m.arrivals.total;
    g.departures += m.departures.total;
    g.knownFees += m.arrivals.paid + m.departures.paid
      + (includeLoanFees ? m.arrivals.loanFee + m.departures.loanFee : 0);
    g.unknownFees += m.arrivals.undisclosed + m.departures.undisclosed;
    g.count += 1;
    // A club that changed division keeps the league of its most recent window,
    // independently of the input order.
    if (grouping === 'club') {
      const previous = latestClubWindow.get(key);
      if (!previous || m.year > previous[0] || (m.year === previous[0] && m.window > previous[1])) {
        latestClubWindow.set(key, [m.year, m.window]);
        g.sublabel = m.league.name;
        g.flag = m.league.code;
      }
    }
  }

  for (const g of out.values()) {
    g.balance = g.income - g.spend;
    g.coverage = feeCoverage(g.knownFees, g.unknownFees);
  }
  return [...out.values()];
}

export type SortKey = 'label' | 'sublabel' | 'spend' | 'income' | 'balance' | 'volume' | 'arrivals' | 'departures' | 'coverage' | 'titles' | 'spendPerTitle' | 'count';

export function sortGroups(groups: Group[], key: SortKey, dir: 1 | -1): Group[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    if (key === 'label' || key === 'sublabel') {
      const text = a[key].localeCompare(b[key], 'fr') * dir;
      return text || a.key.localeCompare(b.key, 'fr');
    }
    const diff = (a[key] ?? 0) - (b[key] ?? 0);
    return diff ? diff * dir : a.label.localeCompare(b.label, 'fr') || a.key.localeCompare(b.key, 'fr');
  });
  return sorted;
}

export interface Totals {
  spend: number;
  income: number;
  balance: number;
  mercatos: number;
  clubs: number;
  arrivals: number;
  departures: number;
  paidDeals: number;
  undisclosed: number;
}

export function totals(rows: Mercato[], includeLoanFees: boolean): Totals {
  const t: Totals = {
    spend: 0, income: 0, balance: 0, mercatos: rows.length, clubs: 0,
    arrivals: 0, departures: 0, paidDeals: 0, undisclosed: 0,
  };
  const clubs = new Set<number>();
  for (const m of rows) {
    const r = resolve(m, includeLoanFees);
    t.spend += r.spend;
    t.income += r.income;
    t.arrivals += m.arrivals.total;
    t.departures += m.departures.total;
    t.paidDeals += m.arrivals.paid + m.departures.paid
      + (includeLoanFees ? m.arrivals.loanFee + m.departures.loanFee : 0);
    t.undisclosed += m.arrivals.undisclosed + m.departures.undisclosed;
    clubs.add(m.clubId);
  }
  t.balance = t.income - t.spend;
  t.clubs = clubs.size;
  return t;
}

/** Spend/income per season+window, for the timeline chart. Always ordered chronologically. */
export interface SeasonPoint {
  year: number;
  window: 'all' | 0 | 1;
  label: string;
  spend: number;
  income: number;
  balance: number;
}

export type ChartMode = 'annual' | 'summer' | 'winter' | 'split';

export function bySeason(rows: Mercato[], includeLoanFees: boolean, mode: ChartMode = 'split'): SeasonPoint[] {
  const out = new Map<string, SeasonPoint>();
  for (const m of rows) {
    if (mode === 'summer' && m.window !== 0) continue;
    if (mode === 'winter' && m.window !== 1) continue;
    const annual = mode === 'annual';
    const key = annual ? String(m.year) : `${m.year}-${m.window}`;
    let p = out.get(key);
    if (!p) {
      p = {
        year: m.year,
        window: annual ? 'all' : m.window,
        label: annual ? season(m.year) : mercatoLabel(m.year, m.window),
        spend: 0,
        income: 0,
        balance: 0,
      };
      out.set(key, p);
    }
    const r = resolve(m, includeLoanFees);
    p.spend += r.spend;
    p.income += r.income;
  }
  const list = [...out.values()];
  for (const p of list) p.balance = p.income - p.spend;
  return list.sort((a, b) => a.year - b.year || (a.window === 'all' ? 0 : a.window) - (b.window === 'all' ? 0 : b.window));
}
