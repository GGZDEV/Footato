/** Validates the emitted static dataset and fails CI on structural regressions. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const summary = JSON.parse(readFileSync(join(OUT, 'summary.json'), 'utf8'));
const windowsDir = join(OUT, 'windows');
const recentManifestPath = join(ROOT, 'data', 'raw', 'recent', 'manifest.json');
const recentManifest = existsSync(recentManifestPath)
  ? JSON.parse(readFileSync(recentManifestPath, 'utf8'))
  : null;

const fail = (message) => { throw new Error(message); };
if (!summary.rows.length) fail('summary.json ne contient aucune ligne');
if (!existsSync(windowsDir)) fail('dossier windows manquant');

const windows = new Map();
const expectedAggregates = new Map();
const leagueIndexById = new Map(summary.leagues.map((league, index) => [league.id, index]));
let detailCount = 0;
for (const file of readdirSync(windowsDir)) {
  if (!file.endsWith('.json')) continue;
  const rows = JSON.parse(readFileSync(join(windowsDir, file), 'utf8'));
  const detailKey = file.slice(0, -5);
  const match = detailKey.match(/^(.+)_(\d{4})_([01])$/);
  if (!match) fail(`nom de fichier détail invalide : ${file}`);
  const [, leagueId, yearText, windowText] = match;
  const leagueIdx = leagueIndexById.get(leagueId);
  if (leagueIdx == null) fail(`championnat inconnu dans ${file}`);
  windows.set(detailKey, rows);
  detailCount += rows.length;

  for (const movement of rows) {
    if (!Array.isArray(movement) || movement.length !== 6) fail(`mouvement malformé dans ${file}`);
    const [clubId, dir, kind, amount, player] = movement;
    if (!Number.isInteger(clubId) || clubId < 0 || clubId >= summary.clubs.length) fail(`club invalide dans ${file}`);
    if (dir !== 0 && dir !== 1) fail(`sens invalide dans ${file}`);
    if (!Number.isInteger(kind) || kind < 0 || kind > 7) fail(`type invalide dans ${file}`);
    if (!Number.isInteger(amount) || amount < 0) fail(`montant invalide dans ${file}`);
    if (typeof player !== 'string' || !player.trim()) fail(`joueur absent dans ${file}`);
    if (kind !== 0 && kind !== 3 && amount !== 0) fail(`montant ${amount} porté par un type non monétaire dans ${file}`);
    if (kind === 4 && /^(?:Without Club|Retired|Career break|Deceased)$|(?:\s|^)(?:B|II|U\d{2}|Youth|Res\.?|Reserves?|Espoirs?|Primavera)$/i.test(movement[5])) {
      fail(`mouvement administratif classé comme montant indisponible dans ${file}`);
    }

    const key = `${clubId}|${leagueIdx}|${yearText}|${windowText}`;
    // Mirrors summary columns 4..23, but is rebuilt independently from the
    // public movement files rather than trusting build-dataset.mjs.
    let aggregate = expectedAggregates.get(key);
    if (!aggregate) {
      aggregate = Array(20).fill(0);
      expectedAggregates.set(key, aggregate);
    }
    const countBase = dir === 0 ? 4 : 10;
    aggregate[countBase] += 1;
    if (kind === 0) {
      aggregate[countBase + 1] += 1;
      aggregate[dir === 0 ? 0 : 1] += amount;
    } else if (kind === 1) aggregate[countBase + 2] += 1;
    else if (kind === 2 || kind === 5) aggregate[countBase + 3] += 1;
    else if (kind === 3) {
      aggregate[countBase + 3] += 1;
      aggregate[dir === 0 ? 2 : 3] += amount;
      aggregate[dir === 0 ? 18 : 19] += 1;
    } else if (kind === 6) aggregate[countBase + 5] += 1;
    else if (kind === 7) aggregate[dir === 0 ? 16 : 17] += 1;
    else aggregate[countBase + 4] += 1;
  }
}
if (detailCount !== summary.meta.movementCount) {
  fail(`meta.movementCount=${summary.meta.movementCount}, détails=${detailCount}`);
}

const uiKeys = new Set();
const clubsByLeagueSeason = new Map();
const coverageActual = new Map();
for (const row of summary.rows) {
  if (!Array.isArray(row) || row.length !== 24) fail('ligne summary malformée');
  const [clubId, leagueIdx, year, window, spend, income, loanSpend, loanIncome] = row;
  if (![spend, income, loanSpend, loanIncome].every((n) => Number.isInteger(n) && n >= 0)) {
    fail(`montant invalide pour club=${clubId}, saison=${year}, fenêtre=${window}`);
  }
  const uiKey = `${clubId}-${year}-${window}`;
  if (uiKeys.has(uiKey)) fail(`clé UI dupliquée : ${uiKey}`);
  uiKeys.add(uiKey);

  const league = summary.leagues[leagueIdx];
  if (!league) fail(`indice de championnat invalide : ${leagueIdx}`);
  if (window !== 0 && window !== 1) fail(`fenêtre invalide pour club=${clubId}, saison=${year}`);
  if (!Number.isInteger(clubId) || clubId < 0 || clubId >= summary.clubs.length) fail(`club invalide dans summary : ${clubId}`);
  for (const base of [8, 14]) {
    const notApplicable = row[base === 8 ? 20 : 21];
    const parts = row.slice(base + 1, base + 6).reduce((sum, value) => sum + value, 0) + notApplicable;
    if (row[base] !== parts) fail(`${league.id}/${year}/${clubId} : total de mouvements incohérent`);
  }

  const seasonKey = `${league.id}|${year}`;
  if (!clubsByLeagueSeason.has(seasonKey)) clubsByLeagueSeason.set(seasonKey, new Set());
  clubsByLeagueSeason.get(seasonKey).add(clubId);
  const detailKey = `${league.id}_${year}_${window}`;
  if (!windows.has(detailKey)) fail(`fichier détail absent : ${detailKey}.json`);
  const aggregateKey = `${clubId}|${leagueIdx}|${year}|${window}`;
  const expected = expectedAggregates.get(aggregateKey) ?? Array(20).fill(0);
  const actual = row.slice(4, 24);
  if (actual.some((value, index) => value !== expected[index])) {
    fail(`${detailKey}/${summary.clubs[clubId]} : agrégat différent des mouvements détaillés`);
  }
  expectedAggregates.delete(aggregateKey);

  if (!coverageActual.has(league.id)) coverageActual.set(league.id, []);
  coverageActual.get(league.id).push(year);
}

if (expectedAggregates.size) fail(`${expectedAggregates.size} agrégat(s) détaillé(s) absent(s) de summary.json`);

if (summary.meta.rowCount !== summary.rows.length) fail('meta.rowCount incohérent');
const activeClubIds = new Set(summary.rows.map((row) => row[0]));
if (summary.meta.clubCount !== activeClubIds.size) fail('meta.clubCount incohérent');
if (summary.meta.clubRegistryCount !== summary.clubs.length) fail('meta.clubRegistryCount incohérent');
for (const alias of summary.meta.quality?.clubAliases ?? []) {
  if (!Number.isInteger(alias.fromId) || !Number.isInteger(alias.toId)) fail('redirection de club invalide');
  if (activeClubIds.has(alias.fromId)) fail(`ancien club encore actif : ${alias.from}`);
  if (!activeClubIds.has(alias.toId)) fail(`club canonique absent : ${alias.to}`);
}
const allYears = summary.rows.map((row) => row[2]);
if (summary.meta.yearMin !== Math.min(...allYears) || summary.meta.yearMax !== Math.max(...allYears)) {
  fail('bornes globales de saisons incohérentes');
}

for (const [key, clubs] of clubsByLeagueSeason) {
  if (clubs.size > 24) fail(`${key} contient ${clubs.size} clubs : rattachement saisonnier probablement incorrect`);
}

for (const league of summary.leagues) {
  const coverage = summary.meta.coverageByLeague?.[league.id];
  if (!coverage || coverage.yearMin == null || coverage.yearMax == null) {
    fail(`couverture absente pour ${league.id}`);
  }
  const years = coverageActual.get(league.id) ?? [];
  if (
    coverage.rowCount !== years.length ||
    coverage.yearMin !== Math.min(...years) ||
    coverage.yearMax !== Math.max(...years)
  ) {
    fail(`couverture incohérente pour ${league.id}`);
  }
}

const membershipAudits = recentManifest?.memberships?.leagues ?? [];
if (recentManifest && !membershipAudits.length) fail('audit des compositions de ligue récentes absent');
const latestAuditedSeason = membershipAudits.reduce((max, audit) => Math.max(max, audit.season), -Infinity);
for (const audit of membershipAudits) {
  // Past seasons may miss clubs that have since left every covered competition;
  // only the current season, on which the freshness claims rest, must be whole.
  if (audit.season === latestAuditedSeason && !audit.complete) {
    fail(`${audit.leagueId} ${audit.season} : composition de la saison courante incomplète`);
  }
  if (!audit.resolvedCount || audit.resolvedCount < Math.ceil(audit.teamCount * 0.75)) {
    fail(`${audit.leagueId} ${audit.season} : composition de ligue trop partielle`);
  }
  const coverage = summary.meta.coverageByLeague[audit.leagueId];
  if ((coverage?.yearMax ?? -Infinity) < audit.season) {
    fail(`${audit.leagueId} ${audit.season} : composition validée mais aucune donnée publiée`);
  }
}

/* ------------------------------ freshness -------------------------------- */

/**
 * A single 45-day threshold was the hole that let the July 2026 stall through.
 * It is a reasonable age for a finished season and a catastrophic one for a
 * mercato in progress: the upstream scraper was blocked for six weeks, the site
 * kept publishing a season that was ~90% missing, and nothing failed because
 * the dump was only 22 days old.
 *
 * Freshness is therefore judged against what the data is *for*. A closed season
 * does not change, so an old snapshot of it is not a defect. An open window
 * changes daily, so the origin that owns the current season must be recent.
 */
const OPEN_WINDOW_MONTHS = new Set([0, 5, 6, 7, 8]); // janvier, juin-septembre (UTC)
const MAX_AGE_DAYS = { openWindow: 7, closedWindow: 45 };

const now = new Date();
const windowIsOpen = OPEN_WINDOW_MONTHS.has(now.getUTCMonth());
const ageInDays = (isoDate) => (Date.now() - new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000;

if (summary.meta.sourceUpdatedAt) {
  const age = ageInDays(summary.meta.sourceUpdatedAt);
  if (age < -1) fail(`date source future : ${summary.meta.sourceUpdatedAt}`);
  if (age > MAX_AGE_DAYS.closedWindow) fail(`source trop ancienne : ${Math.floor(age)} jours`);
}

const currentSeason = summary.meta.currentSeason;
if (currentSeason) {
  if (currentSeason.year !== summary.meta.yearMax) {
    fail(`saison courante déclarée ${currentSeason.year} mais les données s'arrêtent en ${summary.meta.yearMax}`);
  }
  if (!currentSeason.updatedAt) {
    fail(`aucune date de fraîcheur pour la saison courante ${currentSeason.year}`);
  } else {
    const age = ageInDays(currentSeason.updatedAt);
    const limit = windowIsOpen ? MAX_AGE_DAYS.openWindow : MAX_AGE_DAYS.closedWindow;
    if (age < -1) fail(`date future pour la saison courante : ${currentSeason.updatedAt}`);
    if (age > limit) {
      fail(
        `saison ${currentSeason.year}/${currentSeason.year + 1} vieille de ${Math.floor(age)} jours `
        + `(origine « ${currentSeason.origin} », limite ${limit} j${windowIsOpen ? ', mercato ouvert' : ''}). `
        + 'Relancez `npm run data:collect` plutôt que de publier un mercato figé.',
      );
    }
  }
}

/* --------------------------- relative completeness ------------------------ */

/**
 * Age is not enough on its own: a source can be published daily and still have
 * stopped ingesting. This compares the current season against the previous one
 * on the same measure, per league, and refuses a collapse that no calendar
 * effect explains.
 *
 * The threshold is deliberately loose. A mercato in progress genuinely holds
 * fewer movements than a finished one — roughly half a summer's business is
 * booked after early August — so this is not a completeness estimate. It is a
 * floor that catches an origin which has quietly stopped, which is what
 * actually happened.
 */
// Overridable so the floor can be raised once a window closes, when a season
// should be near-complete and 25% would no longer be a meaningful bar.
const MIN_SEASON_RATIO = Number.parseFloat(process.env.FOOTATO_MIN_SEASON_RATIO ?? '0.25');

const movementsBySeason = new Map();
for (const row of summary.rows) {
  const key = `${row[1]}|${row[2]}`;
  movementsBySeason.set(key, (movementsBySeason.get(key) ?? 0) + row[8] + row[14]);
}

const completeness = [];
for (const [leagueIdx, league] of summary.leagues.entries()) {
  const current = movementsBySeason.get(`${leagueIdx}|${summary.meta.yearMax}`) ?? 0;
  const previous = movementsBySeason.get(`${leagueIdx}|${summary.meta.yearMax - 1}`) ?? 0;
  // A league Footato does not cover for the current season (no membership
  // source) legitimately has nothing; only a league that has both is compared.
  if (!previous || !current) continue;
  const ratio = current / previous;
  completeness.push({ leagueId: league.id, current, previous, ratio });
  if (ratio < MIN_SEASON_RATIO) {
    fail(
      `${league.id} : ${current} mouvements en ${summary.meta.yearMax}/${summary.meta.yearMax + 1} `
      + `contre ${previous} la saison précédente (${(ratio * 100).toFixed(0)} %, plancher ${MIN_SEASON_RATIO * 100} %). `
      + 'Une source qui a cessé d\'ingérer ressemble exactement à ça.',
    );
  }
}

/* ------------------- recent-transfer cross-check (optional) --------------- */

/**
 * public/data/latest.json is the one freshness signal that is not self-reported:
 * it lists what the source published in the last days and whether the data holds
 * it, matched on Transfermarkt's transfer id.
 *
 * A collapsing inclusion rate is a sharper alarm than any date, because it stays
 * wrong even when the collection ran on time — a league page that stops listing
 * moves, or a parser that silently drops rows, shows up here and nowhere else.
 * The floor is loose: a move published between the collection and the check is
 * legitimately absent, so a handful of misses is normal operation.
 */
const MIN_INCLUSION_RATE = Number.parseFloat(process.env.FOOTATO_MIN_INCLUSION_RATE ?? '0.6');
const latestPath = join(OUT, 'latest.json');
let latest = null;
if (existsSync(latestPath)) {
  latest = JSON.parse(readFileSync(latestPath, 'utf8'));
  if (!Array.isArray(latest.transfers) || !latest.transfers.length) {
    fail('latest.json ne contient aucun transfert');
  }
  for (const transfer of latest.transfers) {
    if (!transfer.transferId) fail('transfert récent sans identifiant dans latest.json');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transfer.date ?? '')) fail(`date invalide dans latest.json : ${transfer.date}`);
    if (typeof transfer.included !== 'boolean') fail('latest.json : inclusion non renseignée');
  }

  const age = ageInDays(latest.meta.checkedAt);
  const limit = windowIsOpen ? MAX_AGE_DAYS.openWindow : MAX_AGE_DAYS.closedWindow;
  if (age > limit) {
    fail(`relevé des derniers transferts vieux de ${Math.floor(age)} jours (limite ${limit} j)`);
  }

  const rate = latest.meta.includedCount / latest.meta.transferCount;
  if (rate < MIN_INCLUSION_RATE) {
    fail(
      `seulement ${latest.meta.includedCount}/${latest.meta.transferCount} `
      + `(${Math.round(rate * 100)} %) des transferts récents sont dans les données, `
      + `plancher ${Math.round(MIN_INCLUSION_RATE * 100)} %. La collecte ne suit plus la source.`,
    );
  }
}

/* ----------------------- first-party collection health -------------------- */

const collected = summary.meta.quality?.collected;
if (collected) {
  const currentFailures = (collected.failures ?? []).filter((f) => f.season === summary.meta.yearMax);
  if (currentFailures.length) {
    const detail = currentFailures.map((f) => `${f.leagueId} ${f.window} (${f.error})`).join(', ');
    fail(`collecte incomplète sur la saison courante : ${detail}`);
  }
  for (const composition of collected.compositions ?? []) {
    if (composition.teamCount < 14) {
      fail(`${composition.leagueId} ${composition.season} : ${composition.teamCount} clubs collectés`);
    }
  }
}

console.log(`✓ validation indépendante : ${summary.meta.rowCount} mercatos · ${detailCount} mouvements · ${windows.size} fenêtres`);
console.log('  montants, prêts, catégories, arrivées et départs recalculés depuis chaque mouvement détaillé');
console.log(`  couverture ${summary.meta.yearMin}-${summary.meta.yearMax} · source ${summary.meta.sourceUpdatedAt ?? 'historique'}`);
for (const origin of summary.meta.origins ?? []) {
  const label = origin.firstParty ? 'collecte propre' : 'import';
  console.log(`  ${label.padEnd(15)} ${origin.dataset.padEnd(44)} ${origin.updatedAt ?? 'sans date'} · ${origin.movementCount} mouvements`);
}
if (currentSeason) {
  const age = currentSeason.updatedAt ? Math.floor(ageInDays(currentSeason.updatedAt)) : null;
  console.log(
    `  saison courante ${currentSeason.year}/${currentSeason.year + 1} · origine ${currentSeason.origin}`
    + `${age == null ? '' : ` · ${age} jour${age > 1 ? 's' : ''}`}`
    + ` · fenêtre ${windowIsOpen ? 'ouverte' : 'fermée'} (limite ${windowIsOpen ? MAX_AGE_DAYS.openWindow : MAX_AGE_DAYS.closedWindow} j)`,
  );
}
if (latest) {
  const rate = Math.round((latest.meta.includedCount / latest.meta.transferCount) * 100);
  console.log(
    `  derniers transferts : ${latest.meta.includedCount}/${latest.meta.transferCount} pris en compte (${rate} %)`
    + ` · source ${latest.meta.newestSeen} · nous ${latest.meta.newestIncluded ?? 'aucun'}`,
  );
}
if (completeness.length) {
  const weakest = completeness.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  console.log(
    `  complétude relative la plus faible : ${weakest.leagueId} à ${(weakest.ratio * 100).toFixed(0)} %`
    + ` de la saison précédente (${weakest.current} contre ${weakest.previous})`,
  );
}
