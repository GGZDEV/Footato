/**
 * The competitions Footato collects, and how each maps onto Transfermarkt.
 *
 * `id` is Footato's own identifier, `tm` Transfermarkt's — they differ for the
 * Bundesliga (L1) and the Portuguese league (PO1). `file` matches the historical
 * CSV naming so a collected league lands in the same bucket as its imported
 * history.
 *
 * `membershipControl` records whether an independent source can confirm this
 * league's composition. openfootball publishes fixture lists for the European
 * leagues but not for Russia or Saudi Arabia, and recording null rather than
 * omitting the field keeps a single-source claim from reading as a
 * cross-checked one.
 */
export const LEAGUES = [
  { id: 'GB1', tm: 'GB1', slug: 'premier-league',   file: 'premier-league.csv',   name: 'Premier League',   country: 'England',      membershipControl: 'openfootball' },
  { id: 'ES1', tm: 'ES1', slug: 'laliga',           file: 'primera-division.csv', name: 'LaLiga',           country: 'Spain',        membershipControl: 'openfootball' },
  { id: 'IT1', tm: 'IT1', slug: 'serie-a',          file: 'serie-a.csv',          name: 'Serie A',          country: 'Italy',        membershipControl: 'openfootball' },
  { id: 'DE1', tm: 'L1',  slug: 'bundesliga',       file: '1-bundesliga.csv',     name: 'Bundesliga',       country: 'Germany',      membershipControl: 'openfootball' },
  { id: 'FR1', tm: 'FR1', slug: 'ligue-1',          file: 'ligue-1.csv',          name: 'Ligue 1',          country: 'France',       membershipControl: 'openfootball' },
  { id: 'PT1', tm: 'PO1', slug: 'liga-portugal',    file: 'liga-nos.csv',         name: 'Liga Portugal',    country: 'Portugal',     membershipControl: 'openfootball' },
  { id: 'NL1', tm: 'NL1', slug: 'eredivisie',       file: 'eredivisie.csv',       name: 'Eredivisie',       country: 'Netherlands',  membershipControl: 'openfootball' },
  { id: 'RU1', tm: 'RU1', slug: 'premier-liga',     file: 'premier-liga.csv',     name: 'Premier Liga',     country: 'Russia',       membershipControl: null },
  { id: 'GB2', tm: 'GB2', slug: 'championship',     file: 'championship.csv',     name: 'Championship',     country: 'England',      membershipControl: 'openfootball' },
  { id: 'SA1', tm: 'SA1', slug: 'saudi-pro-league', file: 'saudi-pro-league.csv', name: 'Saudi Pro League', country: 'Saudi Arabia', membershipControl: null },
];

/** Footato id for a Transfermarkt competition id, or null when out of scope. */
export const footatoLeagueId = (transfermarktId) =>
  LEAGUES.find((league) => league.tm === transfermarktId)?.id ?? null;
