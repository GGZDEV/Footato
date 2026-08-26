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
  /** Registry size can exceed active clubs because old shareable ids are never recycled. */
  clubRegistryCount: number;
  rowCount: number;
  movementCount: number;
  coverageByLeague: Record<string, { yearMin: number | null; yearMax: number | null; rowCount: number }>;
  quality: {
    duplicateRowsRemoved: number;
    skippedRows: number;
    clubAliases: Array<{ from: string; to: string; fromId: number; toId: number }>;
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
  /** Retirement, no-club or reserve movement: no commercial fee is expected. */
  notApplicable: number;
  /** Subset of loan: a public loan indemnity exists. */
  loanFee: number;
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

export type FreshnessStatus = 'pending' | 'ready';
export type FreshnessSignalKind = 'moved' | 'added' | 'removed';

export interface FreshnessSignal {
  kind: FreshnessSignalKind;
  playerId: number;
  playerName: string;
  fromTeam: { id: number; name: string } | null;
  toTeam: { id: number; name: string } | null;
  firstDetectedAt: string;
  lastSeenAt: string;
}

export interface FreshnessData {
  meta: {
    status: FreshnessStatus;
    provider: 'football-data.org';
    fetchedAt: string | null;
    previousFetchedAt: string | null;
    sourceUpdatedAt: string | null;
    competitionCount: number;
    teamCount: number;
    playerCount: number;
    ambiguousPlayerCount: number;
    newSignalCount: number;
    signalCount: number;
    isBaseline: boolean;
  };
  competitions: Array<{ code: string; name: string; seasonStart: string | null; teamCount: number }>;
  teams: Array<{
    id: number;
    name: string;
    shortName: string;
    tla: string;
    lastUpdated: string | null;
    competitions: string[];
    players: Array<{ id: number; name: string; position: string | null; nationality: string | null }>;
  }>;
  signals: FreshnessSignal[];
  honours: HonoursData;
}

export interface HonourTitle {
  competitionCode: string;
  competitionName: string;
  category: 'league' | 'domesticCup' | 'leagueCup' | 'championsLeague' | 'europaLeague' | 'conferenceLeague' | 'domesticSupercup' | 'uefaSupercup' | 'world';
  season: number;
  source?: string;
  verificationSource?: string;
  winner: { providerId: number | null; name: string; clubId: number | null; outsideScope?: boolean };
}

export interface HonoursData {
  meta: {
    status: FreshnessStatus;
    provider: string;
    catalogVersion?: string;
    fetchedAt: string | null;
    competitionCount: number;
    titleCount: number;
    matchedTitleCount: number;
    unmatchedTitleCount: number;
    outsideScopeTitleCount?: number;
    crossCheckedTitleCount?: number;
    yearMin: number | null;
    yearMax: number | null;
    commonYearMin: number | null;
    commonYearMax: number | null;
  };
  coverage: Array<{
    code: string;
    name: string;
    category?: HonourTitle['category'];
    yearMin: number | null;
    yearMax: number | null;
    titleCount: number;
    matchedTitleCount: number;
    outsideScopeTitleCount?: number;
    source?: string;
    verificationSource?: string;
    missingSeasons?: Array<{ season: number; reason: string }>;
  }>;
  titles: HonourTitle[];
}

export const KIND_LABELS = [
  'Transfert payant',
  'Transfert libre',
  'Prêt',
  'Prêt payant',
  'Montant non divulgué',
  'Fin de prêt',
  'Libre ou prêt',
  'Administratif / sans indemnité applicable',
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
