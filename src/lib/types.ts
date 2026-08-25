/** A transfer window: 0 = summer, 1 = winter (the winter window of 2003/04 happens in Jan. 2004). */
export type Window = 0 | 1;

export interface League {
  id: string;
  name: string;
  country: string;
  flag: string;
  tier: number;
}

export interface Meta {
  generatedAt: string;
  source: string;
  sourceDataset: string;
  yearMin: number;
  yearMax: number;
  clubCount: number;
  rowCount: number;
  movementCount: number;
}

/** How the arrivals (or departures) of a window break down by deal type. */
export interface Counts {
  total: number;
  paid: number;
  free: number;
  loan: number;
  undisclosed: number;
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
