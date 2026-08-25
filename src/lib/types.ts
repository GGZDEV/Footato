/** A transfer window: 0 = summer, 1 = winter (the winter window of 2003/04 happens in Jan. 2004). */
export type Window = 0 | 1;

export interface League {
  id: string;
  name: string;
  country: string;
  /** Country key for the inline SVG flag (see components/Flag). */
  code: string;
  tier: number;
}

export interface Meta {
  generatedAt: string;
  /** Last modification date reported by the maintained upstream export. */
  sourceUpdatedAt: string | null;
  source: string;
  sourceDataset: string;
  yearMin: number;
  yearMax: number;
  clubCount: number;
  rowCount: number;
  movementCount: number;
  coverageByLeague: Record<string, { yearMin: number | null; yearMax: number | null; rowCount: number }>;
  quality: {
    duplicateRowsRemoved: number;
    skippedRows: number;
    recent: null | {
      duplicatesRemoved: number;
      skippedFuture: number;
      skippedBadDate: number;
      skippedNoMembership: number;
    };
    memberships: Array<{
      leagueId: string;
      season: number;
      teamCount: number;
      complete: boolean;
    }>;
  };
}

/** How the arrivals (or departures) of a window break down by deal type. */
export interface Counts {
  total: number;
  paid: number;
  free: number;
  loan: number;
  undisclosed: number;
  /** Free transfers and loans that the recent source publishes without distinction. */
  freeOrLoan: number;
}

/** One club's activity over one transfer window. Amounts are in thousands of euros. */
export interface Mercato {
  key: string;
  clubId: number;
  club: string;
  league: League;
  year: number;
  window: Window;
  spend: number;
  income: number;
  loanSpend: number;
  loanIncome: number;
  arrivals: Counts;
  departures: Counts;
}

/** A Mercato with the money figures resolved against the "include loan fees" setting. */
export interface Resolved {
  spend: number;
  income: number;
  balance: number;
  volume: number;
}

export interface Dataset {
  meta: Meta;
  leagues: League[];
  mercatos: Mercato[];
  clubs: string[];
}

export const KIND_LABELS = [
  'Transfert payant',
  'Transfert libre',
  'Prêt',
  'Prêt payant',
  'Montant non divulgué',
  'Fin de prêt',
  'Libre ou prêt',
] as const;

/** A single player movement inside one window, as stored in public/data/windows/. */
export interface Movement {
  clubId: number;
  club: string;
  /** 0 = arrival, 1 = departure */
  dir: 0 | 1;
  kind: number;
  amount: number;
  player: string;
  counterpart: string;
}
