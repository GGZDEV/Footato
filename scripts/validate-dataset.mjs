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
let detailCount = 0;
for (const file of readdirSync(windowsDir)) {
  if (!file.endsWith('.json')) continue;
  const rows = JSON.parse(readFileSync(join(windowsDir, file), 'utf8'));
  windows.set(file.slice(0, -5), rows);
  detailCount += rows.length;
}
if (detailCount !== summary.meta.movementCount) {
  fail(`meta.movementCount=${summary.meta.movementCount}, détails=${detailCount}`);
}

const uiKeys = new Set();
const clubsByLeagueSeason = new Map();
for (const row of summary.rows) {
  const [clubId, leagueIdx, year, window, spend, income, loanSpend, loanIncome] = row;
  if (![spend, income, loanSpend, loanIncome].every((n) => Number.isInteger(n) && n >= 0)) {
    fail(`montant invalide pour club=${clubId}, saison=${year}, fenêtre=${window}`);
  }
  const uiKey = `${clubId}-${year}-${window}`;
  if (uiKeys.has(uiKey)) fail(`clé UI dupliquée : ${uiKey}`);
  uiKeys.add(uiKey);

  const league = summary.leagues[leagueIdx];
  const seasonKey = `${league.id}|${year}`;
  if (!clubsByLeagueSeason.has(seasonKey)) clubsByLeagueSeason.set(seasonKey, new Set());
  clubsByLeagueSeason.get(seasonKey).add(clubId);
  const detailKey = `${league.id}_${year}_${window}`;
  const details = (windows.get(detailKey) ?? []).filter((movement) => movement[0] === clubId);
  if (details.length !== row[8] + row[14]) {
    fail(`${detailKey}/${summary.clubs[clubId]} : agrégat=${row[8] + row[14]}, détails=${details.length}`);
  }
}

for (const [key, clubs] of clubsByLeagueSeason) {
  if (clubs.size > 24) fail(`${key} contient ${clubs.size} clubs : rattachement saisonnier probablement incorrect`);
}

for (const league of summary.leagues) {
  const coverage = summary.meta.coverageByLeague?.[league.id];
  if (!coverage || coverage.yearMin == null || coverage.yearMax == null) {
    fail(`couverture absente pour ${league.id}`);
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

console.log(`✓ validation : ${summary.meta.rowCount} mercatos · ${detailCount} mouvements · ${windows.size} fenêtres`);
console.log(`  couverture ${summary.meta.yearMin}-${summary.meta.yearMax} · source ${summary.meta.sourceUpdatedAt ?? 'historique'}`);
