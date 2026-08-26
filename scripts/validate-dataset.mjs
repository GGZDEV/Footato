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
    if (!Number.isInteger(kind) || kind < 0 || kind > 6) fail(`type invalide dans ${file}`);
    if (!Number.isInteger(amount) || amount < 0) fail(`montant invalide dans ${file}`);
    if (typeof player !== 'string' || !player.trim()) fail(`joueur absent dans ${file}`);
    if (kind !== 0 && kind !== 3 && amount !== 0) fail(`montant ${amount} porté par un type non monétaire dans ${file}`);

    const key = `${clubId}|${leagueIdx}|${yearText}|${windowText}`;
    // Mirrors summary columns 4..19, but is rebuilt independently from the
    // public movement files rather than trusting build-dataset.mjs.
    let aggregate = expectedAggregates.get(key);
    if (!aggregate) {
      aggregate = Array(16).fill(0);
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
    } else if (kind === 6) aggregate[countBase + 5] += 1;
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
  if (!Array.isArray(row) || row.length !== 20) fail('ligne summary malformée');
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
    const parts = row.slice(base + 1, base + 6).reduce((sum, value) => sum + value, 0);
    if (row[base] !== parts) fail(`${league.id}/${year}/${clubId} : total de mouvements incohérent`);
  }

  const seasonKey = `${league.id}|${year}`;
  if (!clubsByLeagueSeason.has(seasonKey)) clubsByLeagueSeason.set(seasonKey, new Set());
  clubsByLeagueSeason.get(seasonKey).add(clubId);
  const detailKey = `${league.id}_${year}_${window}`;
  if (!windows.has(detailKey)) fail(`fichier détail absent : ${detailKey}.json`);
  const aggregateKey = `${clubId}|${leagueIdx}|${year}|${window}`;
  const expected = expectedAggregates.get(aggregateKey) ?? Array(16).fill(0);
  const actual = row.slice(4, 20);
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
for (const audit of membershipAudits) {
  if (!audit.complete || audit.resolvedCount !== audit.teamCount) {
    fail(`${audit.leagueId} ${audit.season} : composition de ligue incomplète`);
  }
  const coverage = summary.meta.coverageByLeague[audit.leagueId];
  if ((coverage?.yearMax ?? -Infinity) < audit.season) {
    fail(`${audit.leagueId} ${audit.season} : composition validée mais aucune donnée publiée`);
  }
}

if (summary.meta.sourceUpdatedAt) {
  const sourceDate = new Date(`${summary.meta.sourceUpdatedAt}T00:00:00Z`);
  const ageDays = (Date.now() - sourceDate.getTime()) / 86_400_000;
  if (ageDays < -1) fail(`date source future : ${summary.meta.sourceUpdatedAt}`);
  if (ageDays > 45) fail(`source trop ancienne : ${Math.floor(ageDays)} jours`);
}

console.log(`✓ validation indépendante : ${summary.meta.rowCount} mercatos · ${detailCount} mouvements · ${windows.size} fenêtres`);
console.log('  montants, prêts, catégories, arrivées et départs recalculés depuis chaque mouvement détaillé');
console.log(`  couverture ${summary.meta.yearMin}-${summary.meta.yearMax} · source ${summary.meta.sourceUpdatedAt ?? 'historique'}`);
