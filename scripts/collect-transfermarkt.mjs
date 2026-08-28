/**
 * Collects a season's transfers directly from Transfermarkt into Footato's
 * canonical CSV schema, with no third-party rebuild in between.
 *
 * Why this exists
 * ---------------
 * The maintained snapshot Footato imports (dcaribou/transfermarkt-datasets) is
 * itself scraped, and its scraper was blocked from July 2026 onwards. The dump
 * kept being served, so the site published a mercato that was ~90% missing
 * without anything failing. Owning the acquisition for the season in progress
 * removes that dependency; the historical seasons keep using the imports, which
 * are stable precisely because they are finished.
 *
 * Why it is cheap
 * ---------------
 * Transfermarkt renders every club of a competition, both directions and the
 * fee, on ONE page per season and transfer window:
 *
 *   /{slug}/transfers/wettbewerb/{id}/plus/?saison_id={year}&s_w={s|w}&leihe=1
 *
 * So a full refresh of ten leagues for the current season is ~20 requests. That
 * is the whole anti-blocking strategy: the reason a world crawl gets blocked is
 * that it is a world crawl. Nothing here tries to defeat a bot check.
 *
 * What it refuses to do
 * ---------------------
 * Publish a half-read window. A blocked page, a truncated response or a
 * competition that parses to fewer clubs than a league can have all raise
 * instead of being written out as a quiet mercato. Losing a refresh is
 * recoverable; publishing a wrong total silently is not.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TransfermarktClient, BlockedError, BASE, parseCompetitionTransfers } from './lib/transfermarkt.mjs';
import { LEAGUES } from './lib/leagues.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'data', 'raw', 'collected');


const WINDOWS = [
  { code: 's', period: 'Summer' },
  { code: 'w', period: 'Winter' },
];

/**
 * Smallest club count a top-division season can legitimately have. Anything
 * below it means the page did not render fully, which must fail rather than
 * silently shrink a league.
 */
const MIN_CLUBS = 14;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
// A run can be pointed elsewhere to compare a collection against the imported
// data for the same season without disturbing the published one.
const OUT = arg('out', DEFAULT_OUT);

const now = new Date();
// A season starts in July: before then the "current" season is still last year's.
const defaultSeason = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

const seasons = arg('seasons', String(defaultSeason))
  .split(',').map((s) => Number.parseInt(s.trim(), 10)).filter(Number.isFinite);
const onlyLeagues = arg('leagues', '').split(',').map((s) => s.trim()).filter(Boolean);
const leagues = onlyLeagues.length ? LEAGUES.filter((l) => onlyLeagues.includes(l.id)) : LEAGUES;
const delayMs = Number.parseInt(arg('delay', '3000'), 10);

if (!seasons.length) throw new Error('aucune saison valide passée à --seasons');
if (!leagues.length) throw new Error(`aucun championnat connu dans --leagues ${onlyLeagues.join(',')}`);

const client = new TransfermarktClient({ delayMs, log: (m) => console.log(m) });

const pageUrl = (league, season, windowCode) =>
  `${BASE}/${league.slug}/transfers/wettbewerb/${league.tm}/plus/`
  + `?saison_id=${season}&s_w=${windowCode}&leihe=1&intern=0`;

const HEADER = [
  'club_name', 'player_name', 'age', 'position', 'club_involved_name', 'fee',
  'transfer_movement', 'transfer_period', 'fee_cleaned', 'league_name', 'year',
  'season', 'country', 'source', 'source_id', 'transfer_date',
  'club_source_id', 'counterpart_source_id',
].join(',');

const quote = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeAtomic = (path, contents) => {
  const temp = `${path}.part`;
  rmSync(temp, { force: true });
  writeFileSync(temp, contents);
  renameSync(temp, path);
};

const rowsByFile = new Map(leagues.map((l) => [l.file, []]));
const compositions = [];
const failures = [];
const seen = new Set();
let duplicates = 0;
let total = 0;

console.log(`Collecte Transfermarkt · saisons ${seasons.join(', ')} · ${leagues.length} championnats · ${delayMs} ms entre requêtes\n`);

for (const season of seasons) {
  for (const league of leagues) {
    let seasonMovements = 0;
    let seasonPaid = 0;
    const clubIds = new Map();

    for (const window of WINDOWS) {
      const url = pageUrl(league, season, window.code);
      let html;
      try {
        html = await client.get(url);
      } catch (error) {
        // A block is fatal for the whole run: every later page would fail the
        // same way, and a partial season must not reach the CSVs.
        if (error instanceof BlockedError) {
          console.error(`\n! ${error.message}`);
          console.error('  Aucun fichier écrit. Relancez depuis une autre adresse, ou définissez');
          console.error('  BRIGHTDATA_API_KEY pour router les pages bloquées via le Web Unlocker.');
          process.exit(2);
        }
        failures.push({ leagueId: league.id, season, window: window.period, error: error.message });
        console.warn(`  ! ${league.id} ${season} ${window.period} : ${error.message}`);
        continue;
      }

      // Names are written exactly as Transfermarkt renders them. Reconciling
      // them with the historical spellings is build-dataset's job, so that
      // correcting an alias takes effect on the next build instead of requiring
      // every league to be fetched again.
      const { clubs, movements } = parseCompetitionTransfers(html);
      if (clubs.length < MIN_CLUBS) {
        failures.push({
          leagueId: league.id, season, window: window.period,
          error: `${clubs.length} clubs lus (< ${MIN_CLUBS})`,
        });
        console.warn(`  ! ${league.id} ${season} ${window.period} : seulement ${clubs.length} clubs lus, fenêtre ignorée`);
        continue;
      }
      for (const club of clubs) clubIds.set(club.id, club.name);

      for (const m of movements) {
        // transfer_id is Transfermarkt's own key for the move; one transfer is
        // written once per covered club, exactly like the imported rows.
        const key = `${m.transferId || `${m.playerId}:${m.clubId}:${m.counterpartId}:${m.fee}`}:${m.movement}:${league.id}`;
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key);

        rowsByFile.get(league.file).push([
          m.clubName, m.playerName, m.age, m.position, m.counterpartName,
          m.fee, m.movement, window.period, m.feeCleaned,
          league.name, String(season), `${season}/${season + 1}`,
          league.country, 'transfermarkt.com', m.transferId,
          '', m.clubId, m.counterpartId,
        ].map(quote).join(','));

        seasonMovements++;
        if (m.feeCleaned !== 'NA' && Number(m.feeCleaned) > 0) seasonPaid++;
        total++;
      }
    }

    if (!clubIds.size) {
      console.warn(`  ! ${league.id} ${season} : aucune fenêtre exploitable`);
      continue;
    }

    compositions.push({
      leagueId: league.id,
      season,
      teamCount: clubIds.size,
      // Transfermarkt is the transfer source too, so this composition is not an
      // independent confirmation. It is recorded as such, and validated against
      // openfootball downstream wherever openfootball has the league.
      membershipControl: league.membershipControl,
      collectedAt: new Date().toISOString(),
      clubs: [...clubIds].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    });

    console.log(`  ${league.id.padEnd(4)} ${String(season).padEnd(5)} ${String(clubIds.size).padStart(2)} clubs · ${String(seasonMovements).padStart(4)} mouvements · ${seasonPaid} avec indemnité`);
  }
}

if (!total) throw new Error('aucun mouvement collecté : rien ne sera écrit.');

mkdirSync(OUT, { recursive: true });
for (const league of leagues) {
  const rows = rowsByFile.get(league.file);
  if (!rows.length) continue;
  writeAtomic(join(OUT, league.file), `${HEADER}\n${rows.join('\n')}\n`);
}

/**
 * A partial run (--leagues, --seasons) leaves the CSVs of everything it did not
 * touch in place, and those files are still ingested. Replacing the manifest
 * wholesale would therefore describe less than what gets published: the build
 * would use ten leagues while the manifest declared one, and validation would
 * check the composition and freshness of that one only.
 *
 * Entries from previous runs are carried over instead, and each carries its own
 * collection date, so an untouched league ages visibly rather than inheriting
 * the freshness of the league that was just refreshed.
 */
const previous = existsSync(join(OUT, 'manifest.json'))
  ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'))
  : null;

const mergeKey = (entry) => `${entry.leagueId}|${entry.season}`;
const mergeEntries = (older = [], newer = []) => {
  const merged = new Map((older ?? []).map((entry) => [mergeKey(entry), entry]));
  for (const entry of newer) merged.set(mergeKey(entry), entry);
  return [...merged.values()].sort((a, b) => a.season - b.season || a.leagueId.localeCompare(b.leagueId));
};

// A failure is only meaningful for the run that observed it: a league collected
// cleanly this time must not stay marked as failed by an earlier attempt.
const refreshed = new Set(compositions.map(mergeKey));
const carriedFailures = (previous?.failures ?? []).filter((entry) => !refreshed.has(mergeKey(entry)));

const allCompositions = mergeEntries(previous?.compositions, compositions);
const manifest = {
  collectedAt: new Date().toISOString(),
  source: 'transfermarkt.com',
  method: 'first-party collector (scripts/collect-transfermarkt.mjs)',
  // Everything the directory now describes, not just what this run fetched.
  seasons: [...new Set(allCompositions.map((entry) => entry.season))].sort((a, b) => a - b),
  leagues: [...new Set(allCompositions.map((entry) => entry.leagueId))].sort(),
  lastRun: {
    at: new Date().toISOString(),
    seasons,
    leagues: leagues.map((l) => l.id),
    movementCount: total,
    duplicatesRemoved: duplicates,
    requestCount: client.requestCount,
    unlockerRequestCount: client.unlockerCount,
  },
  compositions: allCompositions,
  failures: [...carriedFailures, ...failures],
};
writeAtomic(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\n✓ ${total} mouvements collectés en ${client.requestCount} requêtes`);
if (duplicates) console.log(`  ${duplicates} doublons retirés`);
if (client.unlockerCount) console.log(`  ${client.unlockerCount} pages passées par le Web Unlocker`);
if (failures.length) {
  console.warn(`  ! ${failures.length} fenêtres incomplètes :`);
  for (const f of failures) console.warn(`    ${f.leagueId} ${f.season} ${f.window} — ${f.error}`);
}
