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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'public', 'data');

/** Source file -> league identity. `tier` drives the "1re division only" filter. */
const LEAGUES = [
  { file: 'premier-league.csv',   id: 'GB1', name: 'Premier League',  country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier: 1 },
  { file: 'primera-division.csv', id: 'ES1', name: 'LaLiga',          country: 'Espagne',    flag: '🇪🇸', tier: 1 },
  { file: 'serie-a.csv',          id: 'IT1', name: 'Serie A',         country: 'Italie',     flag: '🇮🇹', tier: 1 },
  { file: '1-bundesliga.csv',     id: 'DE1', name: 'Bundesliga',      country: 'Allemagne',  flag: '🇩🇪', tier: 1 },
  { file: 'ligue-1.csv',          id: 'FR1', name: 'Ligue 1',         country: 'France',     flag: '🇫🇷', tier: 1 },
  { file: 'liga-nos.csv',         id: 'PT1', name: 'Liga Portugal',   country: 'Portugal',   flag: '🇵🇹', tier: 1 },
  { file: 'eredivisie.csv',       id: 'NL1', name: 'Eredivisie',      country: 'Pays-Bas',   flag: '🇳🇱', tier: 1 },
  { file: 'premier-liga.csv',     id: 'RU1', name: 'Premier Liga',    country: 'Russie',     flag: '🇷🇺', tier: 1 },
  { file: 'championship.csv',     id: 'GB2', name: 'Championship',    country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', tier: 2 },
];

/** Movement kinds, kept as small ints in the emitted JSON. */
const KIND = { PAID: 0, FREE: 1, LOAN: 2, LOAN_FEE: 3, UNDISCLOSED: 4, END_OF_LOAN: 5, FREE_OR_LOAN: 6 };

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
function classify(fee) {
  const f = fee.trim();
  // Emitted by scripts/import-recent.mjs: upstream collapses free transfers and loans.
  if (f === 'free transfer or loan') return KIND.FREE_OR_LOAN;
  if (f === 'free transfer') return KIND.FREE;
  if (f.startsWith('Loan fee')) return KIND.LOAN_FEE;
  if (f === 'loan transfer') return KIND.LOAN;
  if (f.startsWith('End of loan')) return KIND.END_OF_LOAN;
  if (f.includes('€')) return KIND.PAID;
  return KIND.UNDISCLOSED; // '?', '-' and anything unparseable
}

/** fee_cleaned is expressed in millions of euros, with at most 3 decimals. */
function toThousands(feeCleaned) {
  if (!feeCleaned || feeCleaned === 'NA') return 0;
  const n = Number.parseFloat(feeCleaned);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}

const clubIds = new Map();
const clubs = [];
function clubId(name) {
  if (!clubIds.has(name)) { clubIds.set(name, clubs.length); clubs.push(name); }
  return clubIds.get(name);
}

const agg = new Map();   // clubId|leagueIdx|year|window -> aggregate row
const details = new Map(); // leagueId_year_window -> movement list
let skipped = 0, movements = 0;

/** Reads one canonical CSV and folds its movements into the aggregates. */
function ingest(path, leagueIdx, league) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  let n = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length) { skipped++; continue; }

    const year = Number.parseInt(r[col.year], 10);
    if (!Number.isFinite(year)) { skipped++; continue; }

    const w = r[col.transfer_period].trim() === 'Winter' ? 1 : 0;
    const dir = r[col.transfer_movement].trim() === 'out' ? 1 : 0;
    const kind = classify(r[col.fee]);
    const amount = toThousands(r[col.fee_cleaned]);
    const cid = clubId(r[col.club_name].trim());

    const key = `${cid}|${leagueIdx}|${year}|${w}`;
    let a = agg.get(key);
    if (!a) {
      // [clubId, leagueIdx, year, window, spend, income, loanSpend, loanIncome,
      //  in:  total, paid, free, loan, undisclosed, freeOrLoan,
      //  out: total, paid, free, loan, undisclosed, freeOrLoan]
      a = [cid, leagueIdx, year, w, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      agg.set(key, a);
    }
    const base = dir === 0 ? 8 : 14;
    a[base] += 1;
    if (kind === KIND.PAID) { a[base + 1] += 1; a[dir === 0 ? 4 : 5] += amount; }
    else if (kind === KIND.FREE) a[base + 2] += 1;
    else if (kind === KIND.LOAN || kind === KIND.END_OF_LOAN) a[base + 3] += 1;
    else if (kind === KIND.LOAN_FEE) { a[base + 3] += 1; a[dir === 0 ? 6 : 7] += amount; }
    else if (kind === KIND.FREE_OR_LOAN) a[base + 5] += 1;
    else a[base + 4] += 1;

    const dkey = `${league.id}_${year}_${w}`;
    if (!details.has(dkey)) details.set(dkey, []);
    details.get(dkey).push([
      cid, dir, kind, amount,
      r[col.player_name].trim(),
      r[col.club_involved_name].trim(),
    ]);
    movements++;
    n++;
  }
  return n;
}

for (const [leagueIdx, league] of LEAGUES.entries()) {
  const base = join(RAW, league.file);
  const recent = join(RAW, 'recent', league.file);
  const hasBase = existsSync(base);
  const hasRecent = existsSync(recent);

  if (!hasBase && !hasRecent) {
    console.warn(`! missing ${league.file} — run \`npm run data:fetch\` first`);
    continue;
  }

  const n = hasBase ? ingest(base, leagueIdx, league) : 0;
  const extra = hasRecent ? ingest(recent, leagueIdx, league) : 0;
  console.log(`  ${league.id.padEnd(4)} ${league.name.padEnd(16)} ${n} movements${extra ? ` (+${extra} récents)` : ''}`);
}

const rows = [...agg.values()].sort((a, b) => a[2] - b[2] || a[3] - b[3] || a[1] - b[1] || a[0] - b[0]);
const years = rows.map((r) => r[2]);

rmSync(join(OUT, 'windows'), { recursive: true, force: true });
mkdirSync(join(OUT, 'windows'), { recursive: true });

const summary = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'Transfermarkt',
    sourceDataset: 'github.com/ewenme/transfers',
    yearMin: Math.min(...years),
    yearMax: Math.max(...years),
    clubCount: clubs.length,
    rowCount: rows.length,
    movementCount: movements,
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

console.log(`\n✓ ${rows.length} mercatos · ${clubs.length} clubs · ${movements} mouvements · ${summary.meta.yearMin}-${summary.meta.yearMax}`);
console.log(`  summary.json ${(readFileSync(join(OUT, 'summary.json')).length / 1e6).toFixed(1)} Mo · windows/ ${size(join(OUT, 'windows'))} Mo (${details.size} fichiers)`);
if (skipped) console.log(`  ${skipped} lignes ignorées (malformées)`);
