/**
 * Builds the site dataset from the raw Transfermarkt CSV exports in data/raw/.
 *
 * Emits into public/data/:
 *   summary.json                     leagues, clubs and one aggregate row per club x season x window
 *   windows/<league>_<year>_<w>.json the individual movements of that window, loaded on demand
 *
 * All amounts are stored as integers in thousands of euros so sums stay exact.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUB_ALIASES as SHARED_CLUB_ALIASES } from './lib/club-aliases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'public', 'data');
const RECENT_MANIFEST_PATH = join(RAW, 'recent', 'manifest.json');
const recentManifest = existsSync(RECENT_MANIFEST_PATH)
  ? JSON.parse(readFileSync(RECENT_MANIFEST_PATH, 'utf8'))
  : null;
const COLLECTED_MANIFEST_PATH = join(RAW, 'collected', 'manifest.json');
const collectedManifest = existsSync(COLLECTED_MANIFEST_PATH)
  ? JSON.parse(readFileSync(COLLECTED_MANIFEST_PATH, 'utf8'))
  : null;
// Seasons Footato collected itself take precedence over the same seasons in the
// maintained import. Both describe the same Transfermarkt moves, so they are not
// merged: the fresher origin owns the season outright and the other is skipped
// for those years, which also keeps the movement count free of near-duplicates
// that differ only by upstream id.
const collectedSeasons = new Set(
  (collectedManifest?.seasons ?? []).map(Number).filter(Number.isFinite),
);

/** Source file -> league identity. `code` selects the inline SVG flag. */
const LEAGUES = [
  { file: 'premier-league.csv',   id: 'GB1', name: 'Premier League',  country: 'Angleterre', code: 'eng', tier: 1 },
  { file: 'primera-division.csv', id: 'ES1', name: 'LaLiga',          country: 'Espagne',    code: 'es', tier: 1 },
  { file: 'serie-a.csv',          id: 'IT1', name: 'Serie A',         country: 'Italie',     code: 'it', tier: 1 },
  { file: '1-bundesliga.csv',     id: 'DE1', name: 'Bundesliga',      country: 'Allemagne',  code: 'de', tier: 1 },
  { file: 'ligue-1.csv',          id: 'FR1', name: 'Ligue 1',         country: 'France',     code: 'fr', tier: 1 },
  { file: 'liga-nos.csv',         id: 'PT1', name: 'Liga Portugal',   country: 'Portugal',   code: 'pt', tier: 1 },
  { file: 'eredivisie.csv',       id: 'NL1', name: 'Eredivisie',      country: 'Pays-Bas',   code: 'nl', tier: 1 },
  { file: 'premier-liga.csv',     id: 'RU1', name: 'Premier Liga',    country: 'Russie',     code: 'ru', tier: 1 },
  { file: 'championship.csv',     id: 'GB2', name: 'Championship',    country: 'Angleterre', code: 'eng', tier: 2 },
  { file: 'saudi-pro-league.csv', id: 'SA1', name: 'Saudi Pro League', country: 'Arabie saoudite', code: 'sa', tier: 1 },
];

/** Movement kinds, kept as small ints in the emitted JSON. */
const KIND = {
  PAID: 0, FREE: 1, LOAN: 2, LOAN_FEE: 3, UNDISCLOSED: 4,
  END_OF_LOAN: 5, FREE_OR_LOAN: 6, NOT_APPLICABLE: 7,
};

// Same legal club, different labels in historical Transfermarkt exports.
// These are explicit on purpose: fuzzy matching could merge unrelated clubs.
const LOCAL_ALIASES = {
  'SC Cambuur-Leeuwarden': 'SC Cambuur Leeuwarden',
  'Empoli FC': 'FC Empoli',
  'Milan AC': 'AC Milan',
  'AC Parma': 'Parma FC',
  'Torino Calcio': 'Torino FC',
  'FC Internazionale': 'Inter Milan',
};

// Reconciliation happens here, at the last step before club ids are assigned,
// rather than in each collector or importer. Every origin passes through this
// one point, so a club cannot end up split by the origin that happened to
// supply a given season, and fixing an alias only needs a rebuild.
const CLUB_ALIASES = new Map([
  ...SHARED_CLUB_ALIASES,
  ...Object.entries(LOCAL_ALIASES),
]);
const canonicalClubName = (name) => CLUB_ALIASES.get(name.trim()) ?? name.trim();

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Maps a raw Transfermarkt fee label to a movement kind. */
function administrativeCounterpart(value) {
  const name = String(value ?? '').trim();
  if (/^(Without Club|Retired|Career break|Deceased)$/i.test(name)) return true;
  return /(?:\s|^)(?:B|II|U\d{2}|Youth|Res\.?|Reserves?|Espoirs?|Primavera)$/i.test(name);
}

function classify(fee, counterpart) {
  const f = fee.trim();
  // Emitted by scripts/import-recent.mjs: upstream collapses free transfers and loans.
  if (f === 'free transfer or loan') return KIND.FREE_OR_LOAN;
  if (f === 'free transfer') return KIND.FREE;
  if (f.startsWith('Loan fee')) return KIND.LOAN_FEE;
  if (f === 'loan transfer') return KIND.LOAN;
  if (f.startsWith('End of loan')) return KIND.END_OF_LOAN;
  if (f.includes('€')) return KIND.PAID;
  // A movement against no club, retirement or a reserve side does not prove
  // that a commercial fee is missing. Keep it out of completeness. A bare '-'
  // between two football clubs remains unavailable, conservatively.
  if (administrativeCounterpart(counterpart)) return KIND.NOT_APPLICABLE;
  return KIND.UNDISCLOSED; // '?' or '-' between football clubs: fee unavailable
}

/** fee_cleaned is expressed in millions of euros, with at most 3 decimals. */
function toThousands(feeCleaned) {
  if (!feeCleaned || feeCleaned === 'NA') return 0;
  const n = Number.parseFloat(feeCleaned);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

// Preserve the published club-id registry across rebuilds. Club ids are part of
// shareable URLs, so deriving them from changing upstream row order would break
// old links every time a source reorders its CSV.
let clubs = [];
const existingSummaryPath = join(OUT, 'summary.json');
if (existsSync(existingSummaryPath)) {
  const existing = JSON.parse(readFileSync(existingSummaryPath, 'utf8'));
  if (Array.isArray(existing.clubs)) clubs = [...existing.clubs];
}
const clubIds = new Map(clubs.map((name, id) => [name, id]));
function clubId(name) {
  if (!clubIds.has(name)) { clubIds.set(name, clubs.length); clubs.push(name); }
  return clubIds.get(name);
}

const agg = new Map();   // clubId|leagueIdx|year|window -> aggregate row
const details = new Map(); // leagueId_year_window -> movement list
const movementKeys = new Set();
let skipped = 0, movements = 0, duplicates = 0;
const movementsByOrigin = { legacy: 0, recent: 0, collected: 0 };

/**
 * Reads one canonical CSV and folds its movements into the aggregates.
 *
 * `accept` decides which seasons this origin owns. Origins are layered rather
 * than merged — historical baseline, maintained import, first-party collection —
 * so exactly one of them supplies any given season and no move is counted twice
 * under two upstream identifiers.
 */
function ingest(path, leagueIdx, league, origin, accept = () => true) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const required = [
    'club_name', 'player_name', 'club_involved_name', 'fee', 'transfer_movement',
    'transfer_period', 'fee_cleaned', 'year',
  ];
  const missing = required.filter((name) => col[name] === undefined);
  if (missing.length) throw new Error(`${path} : colonnes manquantes ${missing.join(', ')}`);
  let n = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length) { skipped++; continue; }

    const year = Number.parseInt(r[col.year], 10);
    if (!Number.isFinite(year)) { skipped++; continue; }
    if (!accept(year)) continue;

    const w = r[col.transfer_period].trim() === 'Winter' ? 1 : 0;
    const dir = r[col.transfer_movement].trim() === 'out' ? 1 : 0;
    const kind = classify(r[col.fee], r[col.club_involved_name]);
    const amount = toThousands(r[col.fee_cleaned]);
    const clubName = canonicalClubName(r[col.club_name]);
    const playerName = r[col.player_name].trim();
    const counterpart = canonicalClubName(r[col.club_involved_name]);
    if (!clubName || !playerName) { skipped++; continue; }

    const sourceId = col.source_id === undefined ? '' : r[col.source_id].trim();
    const movementKey = sourceId
      ? `${origin}|${sourceId}|${dir}|${league.id}`
      : [origin, league.id, year, w, clubName, dir, kind, amount, playerName, counterpart].join('|');
    if (movementKeys.has(movementKey)) { duplicates++; continue; }
    movementKeys.add(movementKey);

    const cid = clubId(clubName);

    const key = `${cid}|${leagueIdx}|${year}|${w}`;
    let a = agg.get(key);
    if (!a) {
      // [clubId, leagueIdx, year, window, spend, income, loanSpend, loanIncome,
      //  in:  total, paid, free, loan, undisclosed, freeOrLoan,
      //  out: total, paid, free, loan, undisclosed, freeOrLoan,
      //  inNotApplicable, outNotApplicable, inLoanFee, outLoanFee]
      a = [cid, leagueIdx, year, w, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      agg.set(key, a);
    }
    const base = dir === 0 ? 8 : 14;
    a[base] += 1;
    if (kind === KIND.PAID) { a[base + 1] += 1; a[dir === 0 ? 4 : 5] += amount; }
    else if (kind === KIND.FREE) a[base + 2] += 1;
    else if (kind === KIND.LOAN || kind === KIND.END_OF_LOAN) a[base + 3] += 1;
    else if (kind === KIND.LOAN_FEE) {
      a[base + 3] += 1;
      a[dir === 0 ? 6 : 7] += amount;
      a[dir === 0 ? 22 : 23] += 1;
    }
    else if (kind === KIND.FREE_OR_LOAN) a[base + 5] += 1;
    else if (kind === KIND.NOT_APPLICABLE) a[dir === 0 ? 20 : 21] += 1;
    else a[base + 4] += 1;

    const dkey = `${league.id}_${year}_${w}`;
    if (!details.has(dkey)) details.set(dkey, []);
    details.get(dkey).push([
      cid, dir, kind, amount,
      playerName,
      counterpart,
    ]);
    movements++;
    n++;
  }
  return n;
}

for (const [leagueIdx, league] of LEAGUES.entries()) {
  const base = join(RAW, league.file);
  const recent = join(RAW, 'recent', league.file);
  const collected = join(RAW, 'collected', league.file);
  const hasBase = existsSync(base);
  const hasRecent = existsSync(recent);
  const hasCollected = existsSync(collected);

  if (!hasBase && !hasRecent && !hasCollected) {
    console.warn(`! missing ${league.file} — run \`npm run data:fetch\` first`);
    continue;
  }

  // Three layers, oldest first, each owning a disjoint set of seasons:
  //   legacy    the typed historical snapshot, up to where the import starts
  //   recent    the maintained import, minus whatever was collected first-party
  //   collected pages Footato read itself; freshest, so it wins its seasons
  const legacyYearMax = hasRecent && recentManifest?.yearMin != null
    ? recentManifest.yearMin - 1
    : Infinity;
  const ownedByCollection = (year) => hasCollected && collectedSeasons.has(year);

  const n = hasBase
    ? ingest(base, leagueIdx, league, 'legacy', (year) => year <= legacyYearMax && !ownedByCollection(year))
    : 0;
  const extra = hasRecent
    ? ingest(recent, leagueIdx, league, 'recent', (year) => !ownedByCollection(year))
    : 0;
  const own = hasCollected
    ? ingest(collected, leagueIdx, league, 'collected', (year) => collectedSeasons.has(year))
    : 0;

  movementsByOrigin.legacy += n;
  movementsByOrigin.recent += extra;
  movementsByOrigin.collected += own;

  const parts = [];
  if (extra) parts.push(`+${extra} récents`);
  if (own) parts.push(`+${own} collectés`);
  console.log(`  ${league.id.padEnd(4)} ${league.name.padEnd(16)} ${n} movements${parts.length ? ` (${parts.join(', ')})` : ''}`);
}

const rows = [...agg.values()].sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[1] - b[1] || a[0] - b[0]);
const years = rows.map((r) => r[2]);
if (!years.length) throw new Error('Aucune donnée valide à publier.');
const activeClubIds = new Set(rows.map((row) => row[0]));
const clubAliases = [...CLUB_ALIASES].map(([from, to]) => ({
  from,
  to,
  fromId: clubIds.get(from) ?? null,
  toId: clubIds.get(to) ?? null,
})).filter((alias) => alias.fromId != null && alias.toId != null && alias.fromId !== alias.toId);

const coverageByLeague = Object.fromEntries(LEAGUES.map((league, leagueIdx) => {
  const leagueYears = rows.filter((r) => r[1] === leagueIdx).map((r) => r[2]);
  return [league.id, {
    yearMin: leagueYears.length ? Math.min(...leagueYears) : null,
    yearMax: leagueYears.length ? Math.max(...leagueYears) : null,
    rowCount: leagueYears.length,
  }];
}));

rmSync(join(OUT, 'windows'), { recursive: true, force: true });
mkdirSync(join(OUT, 'windows'), { recursive: true });

/**
 * Provenance, per layer rather than as one date.
 *
 * A single `sourceUpdatedAt` conflated two very different things: a finished
 * season imported from a snapshot months old is fine, while a mercato in
 * progress read from that same snapshot is stale by weeks. Recording each
 * origin's own date, and which seasons it owns, lets the UI say which is which
 * instead of averaging them into one reassuring number.
 */
const collectedYears = [...collectedSeasons].sort((a, b) => a - b);

/**
 * Oldest collection date among the given league-seasons, as YYYY-MM-DD.
 *
 * Freshness of a set of files is the age of its stalest member, never the age
 * of the most recent one: a partial run refreshes some leagues and leaves the
 * rest untouched, and reporting the newest date would hide exactly the leagues
 * that need attention.
 *
 * An entry with no date of its own predates per-league dating; it falls back to
 * the manifest's date, which is the last moment the directory as a whole is
 * known to have been written.
 */
const oldestCollection = (entries) => {
  if (!entries.length) return collectedManifest?.collectedAt?.slice(0, 10) ?? null;
  const fallback = collectedManifest?.collectedAt ?? null;
  const dates = entries.map((entry) => entry.collectedAt ?? fallback).filter(Boolean).sort();
  return dates[0]?.slice(0, 10) ?? null;
};
const maxYear = Math.max(...years);
const origins = [
  {
    id: 'legacy',
    dataset: 'github.com/ewenme/transfers',
    updatedAt: null,
    movementCount: movementsByOrigin.legacy,
    firstParty: false,
  },
  {
    id: 'recent',
    dataset: 'github.com/dcaribou/transfermarkt-datasets',
    updatedAt: recentManifest?.sourceUpdatedAt?.slice(0, 10) ?? null,
    movementCount: movementsByOrigin.recent,
    firstParty: false,
  },
  {
    id: 'collected',
    dataset: 'transfermarkt.com',
    // The weakest link, not the last run. A partial collection refreshes some
    // leagues and leaves the others in place, and reporting the newest date
    // would let a league quietly age behind a reassuring headline figure.
    updatedAt: oldestCollection(collectedManifest?.compositions ?? []),
    movementCount: movementsByOrigin.collected,
    seasons: collectedYears,
    firstParty: true,
  },
].filter((origin) => origin.movementCount > 0);

const currentSeasonOrigin = collectedSeasons.has(maxYear) ? 'collected' : 'recent';
const currentSeason = {
  year: maxYear,
  origin: currentSeasonOrigin,
  updatedAt: currentSeasonOrigin === 'collected'
    ? oldestCollection((collectedManifest?.compositions ?? []).filter((c) => c.season === maxYear))
    : origins.find((o) => o.id === currentSeasonOrigin)?.updatedAt ?? null,
};

const summary = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    sourceUpdatedAt: recentManifest?.sourceUpdatedAt?.slice(0, 10) ?? null,
    origins,
    currentSeason,
    source: 'Transfermarkt',
    sourceDataset: recentManifest
      ? 'github.com/ewenme/transfers + github.com/dcaribou/transfermarkt-datasets + github.com/openfootball/football.json (league membership)'
      : 'github.com/ewenme/transfers',
    yearMin: Math.min(...years),
    yearMax: Math.max(...years),
    clubCount: activeClubIds.size,
    clubRegistryCount: clubs.length,
    rowCount: rows.length,
    movementCount: movements,
    coverageByLeague,
    quality: {
      duplicateRowsRemoved: duplicates,
      skippedRows: skipped,
      clubAliases,
      recent: recentManifest?.quality ?? null,
      collected: collectedManifest
        ? {
          collectedAt: collectedManifest.collectedAt,
          seasons: collectedManifest.seasons,
          leagues: collectedManifest.leagues,
          movementCount: movementsByOrigin.collected,
          requestCount: collectedManifest.lastRun?.requestCount ?? null,
          failures: collectedManifest.failures ?? [],
          // Compositions read from Transfermarkt itself. For leagues with no
          // independent fixture list (Russia, Saudi Arabia) this is a
          // single-source claim, and says so rather than passing for a check.
          compositions: (collectedManifest.compositions ?? []).map(
            ({ leagueId, season, teamCount, membershipControl }) => ({
              leagueId, season, teamCount, membershipControl,
            }),
          ),
        }
        : null,
      memberships: recentManifest?.memberships?.leagues?.map(({ leagueId, season, teamCount, complete }) => ({
        leagueId, season, teamCount, complete,
      })) ?? [],
    },
  },
  leagues: LEAGUES.map(({ file, ...l }) => l),
  clubs,
  rows,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary));

for (const [key, list] of details) {
  writeFileSync(join(OUT, 'windows', `${key}.json`), JSON.stringify(list));
}

const size = (p) => (readdirSync(p, { withFileTypes: true })
  .filter((d) => d.isFile())
  .reduce((n, d) => n + readFileSync(join(p, d.name)).length, 0) / 1e6).toFixed(1);

console.log(`\n✓ ${rows.length} mercatos · ${activeClubIds.size} clubs actifs · ${movements} mouvements · ${summary.meta.yearMin}-${summary.meta.yearMax}`);
if (clubAliases.length) console.log(`  ${clubAliases.length} identités historiques de clubs consolidées`);
console.log(`  summary.json ${(readFileSync(join(OUT, 'summary.json')).length / 1e6).toFixed(1)} Mo · windows/ ${size(join(OUT, 'windows'))} Mo (${details.size} fichiers)`);
if (duplicates) console.log(`  ${duplicates} doublons exacts retirés`);
if (skipped) console.log(`  ${skipped} lignes ignorées (malformées)`);
