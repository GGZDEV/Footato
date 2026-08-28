/**
 * Compares two origins describing the same league-seasons, movement by movement.
 *
 * Footato now has two independent ways to obtain a season: the maintained
 * third-party import and its own collector. On a finished season they should
 * agree, and any disagreement is information rather than noise — it is either a
 * collector bug or a gap in the import. Running this against a season both
 * cover is what makes the collector trustworthy enough to own the season in
 * progress, where nothing else can check it.
 *
 * Usage:
 *   node scripts/compare-origins.mjs --a data/raw/recent --b <dir> --season 2025
 *
 * The comparison is on amounts and counts, not on row identity: the two origins
 * key transfers differently, so matching ids would only measure the keying.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dirA = arg('a', join(ROOT, 'data', 'raw', 'recent'));
const dirB = arg('b', join(ROOT, 'data', 'raw', 'collected'));
const season = Number.parseInt(arg('season', ''), 10);
// Above this relative gap on a finished season, the two origins are telling
// materially different stories and the run fails instead of merely reporting.
const tolerance = Number.parseFloat(arg('tolerance', '0.05'));

if (!Number.isFinite(season)) throw new Error('précisez --season <année>');
for (const dir of [dirA, dirB]) {
  if (!existsSync(dir)) throw new Error(`dossier introuvable : ${dir}`);
}

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

/** Folds one origin's CSVs into per-file totals for the requested season. */
function readOrigin(dir) {
  const totals = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.csv')) continue;
    const rows = parseCsv(readFileSync(join(dir, file), 'utf8'));
    if (rows.length < 2) continue;
    const col = Object.fromEntries(rows[0].map((h, i) => [h.trim(), i]));
    const bucket = { movements: 0, in: 0, out: 0, spend: 0, income: 0, paid: 0, players: new Set() };

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < rows[0].length) continue;
      if (Number.parseInt(r[col.year], 10) !== season) continue;

      const direction = r[col.transfer_movement].trim();
      const cleaned = r[col.fee_cleaned];
      // Thousands of euros as integers, mirroring build-dataset, so the
      // comparison cannot drift from the published figures by rounding.
      const amount = !cleaned || cleaned === 'NA' ? 0 : Math.round(Number.parseFloat(cleaned) * 1000) || 0;
      const isPaid = /^€/.test(r[col.fee].trim());

      bucket.movements++;
      bucket.players.add(r[col.player_name].trim().toLowerCase());
      if (direction === 'in') { bucket.in++; if (isPaid) bucket.spend += amount; }
      else { bucket.out++; if (isPaid) bucket.income += amount; }
      if (isPaid) bucket.paid++;
    }
    if (bucket.movements) totals.set(file, bucket);
  }
  return totals;
}

const a = readOrigin(dirA);
const b = readOrigin(dirB);
const files = [...new Set([...a.keys(), ...b.keys()])].sort();

const money = (thousands) => `${(thousands / 1000).toFixed(1)} M€`;
const gap = (x, y) => {
  const base = Math.max(Math.abs(x), Math.abs(y));
  return base === 0 ? 0 : Math.abs(x - y) / base;
};

console.log(`Comparaison saison ${season}/${season + 1}`);
console.log(`  A = ${dirA}`);
console.log(`  B = ${dirB}\n`);

let worst = 0;
let compared = 0;
const rows = [];

for (const file of files) {
  const left = a.get(file);
  const right = b.get(file);
  if (!left || !right) {
    console.log(`  ${file.padEnd(24)} présent uniquement dans ${left ? 'A' : 'B'} — non comparable`);
    continue;
  }
  compared++;
  const overlap = [...left.players].filter((p) => right.players.has(p)).length;
  const spendGap = gap(left.spend, right.spend);
  const incomeGap = gap(left.income, right.income);
  worst = Math.max(worst, spendGap, incomeGap);

  rows.push({ file, left, right, spendGap, incomeGap, overlap });
  console.log(`  ${file.replace('.csv', '').padEnd(20)}`);
  console.log(`    mouvements   A ${String(left.movements).padStart(5)}   B ${String(right.movements).padStart(5)}`);
  console.log(`    achats       A ${money(left.spend).padStart(10)}   B ${money(right.spend).padStart(10)}   écart ${(spendGap * 100).toFixed(1)} %`);
  console.log(`    ventes       A ${money(left.income).padStart(10)}   B ${money(right.income).padStart(10)}   écart ${(incomeGap * 100).toFixed(1)} %`);
  console.log(`    joueurs communs ${overlap} / ${Math.max(left.players.size, right.players.size)}`);
}

if (!compared) throw new Error('aucun fichier comparable : les deux origines ne couvrent pas les mêmes championnats.');

console.log(`\n${compared} championnats comparés · écart maximal ${(worst * 100).toFixed(1)} %`);
if (worst > tolerance) {
  console.error(`\n! écart supérieur à la tolérance de ${(tolerance * 100).toFixed(0)} %.`);
  console.error('  Sur une saison terminée les deux origines doivent converger : soit le');
  console.error('  collecteur lit mal une colonne, soit l\'import a manqué une partie du mercato.');
  process.exit(1);
}
console.log('✓ les deux origines convergent.');
