/**
 * Publishes the most recent transfers of each covered league, and says for each
 * one whether Footato's data actually contains it.
 *
 * Why this is not just a "recent moves" list
 * ------------------------------------------
 * Every other freshness indicator on the site is self-reported: the dataset
 * states when it was collected, and the reader has to take that on trust. This
 * one is falsifiable. Transfermarkt's "Latest transfers" listing is the only
 * view carrying a transfer DATE, and it shares the same `transfer_id` as the
 * competition pages the collector reads. Matching the two answers the question
 * that actually matters — "which of yesterday's moves did you get?" — with an
 * exact key rather than a name comparison.
 *
 * A missing row is a real signal, not noise: either the collection ran before
 * the move was published, or a league page did not list it. Both mean the
 * mercato on screen is behind, and both are visible here before anyone reads a
 * wrong total.
 *
 * The amounts are never touched. This file is diagnostic only, exactly like the
 * football-data roster radar: a transfer listed here does not enter any
 * aggregate until the collector picks it up from the league pages.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TransfermarktClient, BlockedError, BASE, parseLatestTransfers } from './lib/transfermarkt.mjs';
import { canonicalClubName } from './lib/club-aliases.mjs';
import { LEAGUES } from './lib/leagues.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTED = join(ROOT, 'data', 'raw', 'collected');
const OUT = join(ROOT, 'public', 'data');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const onlyLeagues = arg('leagues', '').split(',').map((s) => s.trim()).filter(Boolean);
const leagues = onlyLeagues.length ? LEAGUES.filter((l) => onlyLeagues.includes(l.id)) : LEAGUES;
const perLeague = Number.parseInt(arg('limit', '12'), 10);
const delayMs = Number.parseInt(arg('delay', '3500'), 10);

const client = new TransfermarktClient({ delayMs, log: (m) => console.log(m) });

const writeAtomic = (path, contents) => {
  const temp = `${path}.part`;
  rmSync(temp, { force: true });
  writeFileSync(temp, contents);
  renameSync(temp, path);
};

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

/**
 * Every transfer id the collection holds, per league file. The collected rows
 * are the ones that reach the published dataset unchanged, so this set is what
 * "taken into account" means.
 */
function collectedIds() {
  const byLeague = new Map();
  for (const league of LEAGUES) {
    const path = join(COLLECTED, league.file);
    if (!existsSync(path)) continue;
    const rows = parseCsv(readFileSync(path, 'utf8'));
    if (rows.length < 2) continue;
    const col = Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]));
    const ids = new Set();
    for (let i = 1; i < rows.length; i++) {
      const id = rows[i][col.source_id];
      if (id) ids.add(id.trim());
    }
    byLeague.set(league.id, ids);
  }
  return byLeague;
}

const known = collectedIds();
const anyKnown = new Set([...known.values()].flatMap((set) => [...set]));

const listingUrl = (league) =>
  `${BASE}/transfers/neuestetransfers/statistik/plus/`
  + `?plus=1&galerie=0&wettbewerb_id=${league.tm}&land_id=&minMarktwert=0&maxMarktwert=500000000`;

const entries = [];
const failures = [];

console.log(`Derniers transferts · ${leagues.length} championnats · ${perLeague} par championnat\n`);

for (const league of leagues) {
  let html;
  try {
    html = await client.get(listingUrl(league));
  } catch (error) {
    if (error instanceof BlockedError) {
      console.error(`\n! ${error.message}`);
      console.error('  Aucun fichier écrit.');
      process.exit(2);
    }
    failures.push({ leagueId: league.id, error: error.message });
    console.warn(`  ! ${league.id} : ${error.message}`);
    continue;
  }

  const transfers = parseLatestTransfers(html)
    .filter((transfer) => transfer.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, perLeague);

  if (!transfers.length) {
    failures.push({ leagueId: league.id, error: 'aucun transfert daté lu' });
    console.warn(`  ! ${league.id} : aucun transfert daté lu`);
    continue;
  }

  let present = 0;
  for (const transfer of transfers) {
    // A move between two covered leagues is collected under both, so an id
    // found anywhere in the collection counts as taken into account.
    const included = known.get(league.id)?.has(transfer.transferId) || anyKnown.has(transfer.transferId);
    if (included) present++;
    entries.push({
      leagueId: league.id,
      transferId: transfer.transferId,
      date: transfer.date,
      player: transfer.playerName,
      from: canonicalClubName(transfer.from.name),
      fromLeagueId: transfer.from.leagueId || null,
      to: canonicalClubName(transfer.to.name),
      toLeagueId: transfer.to.leagueId || null,
      fee: transfer.fee,
      feeCleaned: transfer.feeCleaned,
      included,
    });
  }

  const newest = transfers[0].date;
  console.log(`  ${league.id.padEnd(4)} ${String(transfers.length).padStart(2)} transferts · ${present} déjà pris en compte · dernier ${newest}`);
}

if (!entries.length) throw new Error('aucun transfert récent lu : rien ne sera écrit.');

entries.sort((a, b) => b.date.localeCompare(a.date) || a.leagueId.localeCompare(b.leagueId));

/** Newest transfer date seen per league, and how far the collection reaches. */
const byLeague = [...leagues].map((league) => {
  const rows = entries.filter((entry) => entry.leagueId === league.id);
  const includedRows = rows.filter((entry) => entry.included);
  return {
    leagueId: league.id,
    sampled: rows.length,
    included: includedRows.length,
    newestSeen: rows[0]?.date ?? null,
    // The most recent move the data actually holds. When this trails newestSeen,
    // the collection is behind by exactly that many days.
    newestIncluded: includedRows[0]?.date ?? null,
  };
}).filter((row) => row.sampled);

const latest = {
  meta: {
    checkedAt: new Date().toISOString(),
    source: 'transfermarkt.com — Latest transfers',
    provider: 'first-party',
    leagueCount: byLeague.length,
    transferCount: entries.length,
    includedCount: entries.filter((entry) => entry.included).length,
    newestSeen: entries[0]?.date ?? null,
    newestIncluded: entries.find((entry) => entry.included)?.date ?? null,
    requestCount: client.requestCount,
    failures,
  },
  leagues: byLeague,
  transfers: entries,
};

mkdirSync(OUT, { recursive: true });
writeAtomic(join(OUT, 'latest.json'), `${JSON.stringify(latest)}\n`);

const { includedCount, transferCount, newestSeen, newestIncluded } = latest.meta;
console.log(`\n✓ ${transferCount} transferts récents · ${includedCount} présents dans les données (${Math.round((includedCount / transferCount) * 100)} %)`);
console.log(`  dernier publié par la source : ${newestSeen}`);
console.log(`  dernier présent chez nous    : ${newestIncluded ?? 'aucun'}`);
if (failures.length) console.warn(`  ! ${failures.length} championnats non relevés`);
