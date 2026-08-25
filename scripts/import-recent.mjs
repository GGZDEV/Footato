/**
 * Imports recent seasons from `dcaribou/transfermarkt-datasets` — the Transfermarkt
 * mirror that is still refreshed weekly — and converts them to the canonical CSV
 * schema used by data/raw/, so build-dataset.mjs picks them up unchanged.
 *
 * The base dataset (ewenme/transfers) stopped at 2022/23; this fills 2023/24 onward.
 *
 *   node scripts/import-recent.mjs --from <dossier> [--since 2023]
 *
 * <dossier> must contain transfers.csv, clubs.csv and competitions.csv, taken from
 * either download listed in the README (aucun scraping, ce sont des exports publiés).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'raw', 'recent');

/** Transfermarkt competition id -> the data/raw file that league lives in. */
const COMPETITIONS = {
  GB1: 'premier-league.csv',
  ES1: 'primera-division.csv',
  IT1: 'serie-a.csv',
  L1: '1-bundesliga.csv',
  FR1: 'ligue-1.csv',
  PO1: 'liga-nos.csv',
  NL1: 'eredivisie.csv',
  RU1: 'premier-liga.csv',
  GB2: 'championship.csv',
};

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SRC = arg('from');
const SINCE = Number.parseInt(arg('since', '2023'), 10);

if (!SRC) {
  console.error('Usage : node scripts/import-recent.mjs --from <dossier> [--since 2023]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readTable(name) {
  const path = join(SRC, name);
  if (!existsSync(path)) {
    console.error(`Fichier manquant : ${path}`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length >= header.length).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i]])),
  );
}

/** "23/24" or "2023/2024" or "2023" -> 2023. Falls back to the transfer date. */
function seasonYear(season, date) {
  const m = String(season ?? '').match(/^(\d{2,4})/);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (m[1].length === 2) return n >= 70 ? 1900 + n : 2000 + n;
    if (n >= 1900) return n;
  }
  const d = new Date(date);
  if (!Number.isNaN(d.getTime())) {
    return d.getUTCMonth() + 1 >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  }
  return NaN;
}

/**
 * The published table has no window flag, so it is derived from the transfer date:
 * June–September is the summer window, everything else counts as winter.
 */
function windowOf(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'Summer';
  const month = d.getUTCMonth() + 1;
  return month >= 6 && month <= 9 ? 'Summer' : 'Winter';
}

/**
 * transfer_fee is in euros: a positive number is a real fee, 0 covers both free
 * transfers and loans (upstream collapses them), and an empty cell means the fee
 * was never disclosed.
 */
function feeLabels(raw) {
  const t = String(raw ?? '').trim();
  if (t === '' || t.toLowerCase() === 'na' || t.toLowerCase() === 'null') {
    return { fee: '?', cleaned: 'NA' };
  }
  const euros = Number.parseFloat(t);
  if (!Number.isFinite(euros)) return { fee: '?', cleaned: 'NA' };
  if (euros <= 0) return { fee: 'free transfer or loan', cleaned: '0' };
  const millions = euros / 1_000_000;
  return {
    fee: millions >= 1 ? `€${millions.toFixed(2)}m` : `€${Math.round(euros / 1000)}Th.`,
    cleaned: String(Number(millions.toFixed(3))),
  };
}

const competitions = new Map(readTable('competitions.csv').map((c) => [c.competition_id, c]));
const clubs = new Map(readTable('clubs.csv').map((c) => [c.club_id, c]));
const transfers = readTable('transfers.csv');

console.log(`  ${transfers.length} transferts lus · ${clubs.size} clubs · ${competitions.size} compétitions`);

const HEADER = 'club_name,player_name,age,position,club_involved_name,fee,transfer_movement,transfer_period,fee_cleaned,league_name,year,season,country';
const files = new Map(Object.values(COMPETITIONS).map((f) => [f, []]));
const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

let kept = 0, skippedOld = 0, skippedLeague = 0;

for (const t of transfers) {
  const year = seasonYear(t.transfer_season, t.transfer_date);
  if (!Number.isFinite(year)) continue;
  if (year < SINCE) { skippedOld++; continue; }

  const period = windowOf(t.transfer_date);
  const { fee, cleaned } = feeLabels(t.transfer_fee);
  const season = `${year}/${year + 1}`;
  let matched = false;

  // Each transfer yields up to two rows: a departure for the selling club and an
  // arrival for the buying one, but only for clubs inside a covered league.
  for (const [side, movement, other] of [
    ['from_club_id', 'out', 'to_club_name'],
    ['to_club_id', 'in', 'from_club_name'],
  ]) {
    const club = clubs.get(t[side]);
    if (!club) continue;
    const file = COMPETITIONS[club.domestic_competition_id];
    if (!file) continue;
    const comp = competitions.get(club.domestic_competition_id);
    matched = true;
    files.get(file).push([
      club.name, t.player_name, '', '', t[other] ?? '',
      fee, movement, period, cleaned,
      comp?.name ?? '', String(year), season, comp?.country_name ?? '',
    ].map(q).join(','));
    kept++;
  }
  if (!matched) skippedLeague++;
}

mkdirSync(OUT, { recursive: true });
let written = 0;
for (const [file, rows] of files) {
  if (!rows.length) continue;
  writeFileSync(join(OUT, file), `${HEADER}\n${rows.join('\n')}\n`);
  console.log(`  ${file.padEnd(24)} ${rows.length} mouvements`);
  written++;
}

console.log(`\n✓ ${kept} mouvements écrits dans data/raw/recent (${written} championnats), saisons ${SINCE}+.`);
console.log(`  ignorés : ${skippedOld} antérieurs à ${SINCE}, ${skippedLeague} hors des championnats couverts.`);
console.log('  Enchaînez avec `npm run data:build`.');
