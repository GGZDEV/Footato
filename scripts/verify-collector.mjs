/**
 * Regression test for the Transfermarkt parser, run offline against a committed
 * fixture.
 *
 * The collector is the only origin for the season in progress, so nothing else
 * cross-checks it there. Transfermarkt can change its markup at any time, and
 * the failure mode that matters is silent: a renamed cell class does not throw,
 * it yields an empty string, and an empty fee reads as a free transfer. That
 * would quietly deflate a mercato rather than break a build.
 *
 * So the assertions are on meaning, not on shape: identified clubs, both
 * directions present, every fee wording mapped to the right label, and known
 * rows carrying their exact amounts.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCompetitionTransfers, normaliseFee, looksBlocked } from './lib/transfermarkt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = readFileSync(join(ROOT, 'data', 'fixtures', 'competition-transfers.html'), 'utf8');

let checks = 0;
const fail = (message) => { throw new Error(message); };
const check = (condition, message) => { checks++; if (!condition) fail(message); };
const equal = (actual, expected, label) => {
  checks++;
  if (actual !== expected) fail(`${label} : attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
};

/* ------------------------------ fee wording ------------------------------- */

// Every wording observed on real pages, including the ones that must NOT become
// a zero-euro movement. '?' and '-' mean the fee is withheld: they belong in the
// completeness denominator, never in the amounts.
const feeCases = [
  ['€87.50m', '€87.50m', '87.5'],
  ['€275k', '€275Th.', '0.275'],
  ['€1.30m', '€1.30m', '1.3'],
  ['free transfer', 'free transfer', '0'],
  ['loan transfer', 'loan transfer', '0'],
  ['End of loan 30/06/2026', 'End of loan 30/06/2026', '0'],
  ['?', '?', 'NA'],
  ['-', '-', 'NA'],
  ['Loan fee:<br /><i>€275k</i>', 'Loan fee:€275Th.', '0.275'],
  ['Loan fee:<br /><i>€2.00m</i>', 'Loan fee:€2.00m', '2'],
];
for (const [raw, expectedFee, expectedCleaned] of feeCases) {
  const { fee, cleaned } = normaliseFee(raw);
  equal(fee, expectedFee, `libellé pour ${JSON.stringify(raw)}`);
  equal(cleaned, expectedCleaned, `montant pour ${JSON.stringify(raw)}`);
}

// An unreadable cell must never be worth zero euros silently.
equal(normaliseFee('').cleaned, 'NA', 'cellule vide');
equal(normaliseFee('Ablöse unbekannt').cleaned, 'NA', 'libellé inconnu');

/* --------------------------- block detection ------------------------------ */

check(looksBlocked(403, ''), 'un HTTP 403 doit être vu comme un blocage');
check(looksBlocked(200, '<html>Please enable JavaScript and then reload</html>'), 'défi DataDome en HTTP 200 non détecté');
check(!looksBlocked(200, '<html><table>…</table></html>'), 'une page normale ne doit pas être vue comme bloquée');

/* ------------------------------- parsing ---------------------------------- */

const { clubs, movements } = parseCompetitionTransfers(fixture);

check(clubs.length >= 4, `${clubs.length} clubs lus dans la fixture, au moins 4 attendus`);
check(clubs.every((club) => /^\d+$/.test(club.id)), 'tout club doit porter un identifiant Transfermarkt numérique');
check(clubs.every((club) => club.name.length > 1), 'tout club doit porter un nom');
equal(new Set(clubs.map((c) => c.id)).size, clubs.length, 'clubs dupliqués');

check(movements.length > 100, `${movements.length} mouvements lus, la fixture en contient bien plus`);
check(movements.some((m) => m.movement === 'in'), 'aucune arrivée lue');
check(movements.some((m) => m.movement === 'out'), 'aucun départ lue');

// Structural completeness. A parser that has drifted typically keeps producing
// rows while losing one column, so each is asserted on every single row.
for (const movement of movements) {
  if (!movement.playerName) fail('mouvement sans joueur');
  if (!/^\d+$/.test(movement.playerId)) fail(`joueur sans identifiant : ${movement.playerName}`);
  if (!/^\d+$/.test(movement.clubId)) fail(`club sans identifiant : ${movement.clubName}`);
  if (!movement.counterpartName) fail(`mouvement sans club adverse : ${movement.playerName}`);
  if (!/^\d+$/.test(movement.transferId)) fail(`mouvement sans identifiant de transfert : ${movement.playerName}`);
  if (movement.feeCleaned !== 'NA' && !Number.isFinite(Number(movement.feeCleaned))) {
    fail(`montant illisible pour ${movement.playerName} : ${movement.feeCleaned}`);
  }
}
checks += 6;

// A known row, end to end: the amount, the direction and the counterparty must
// all survive the parse together.
const guimaraes = movements.find((m) => m.playerName === 'Bruno Guimarães');
check(Boolean(guimaraes), 'Bruno Guimarães absent de la fixture');
equal(guimaraes.movement, 'in', 'sens du mouvement Guimarães');
equal(guimaraes.fee, '€87.50m', 'indemnité Guimarães');
equal(guimaraes.feeCleaned, '87.5', 'montant Guimarães');
equal(guimaraes.counterpartName, 'Newcastle United', 'club vendeur Guimarães');

// The fixture mixes two leagues on purpose, so a thousands-scale loan fee and a
// millions-scale one are both exercised by the same run.
const loanFees = movements.filter((m) => m.fee.startsWith('Loan fee:'));
check(loanFees.length > 0, 'aucune indemnité de prêt lue : la source maintenue les perd, pas le collecteur');
check(
  loanFees.every((m) => Number(m.feeCleaned) > 0),
  'une indemnité de prêt lue à zéro euro',
);

// Withheld fees must stay withheld rather than collapse into free transfers.
const withheld = movements.filter((m) => m.fee === '?' || m.fee === '-');
check(withheld.every((m) => m.feeCleaned === 'NA'), 'une indemnité non divulguée comptée comme nulle');

const paid = movements.filter((m) => m.feeCleaned !== 'NA' && Number(m.feeCleaned) > 0);
check(paid.length > 5, `${paid.length} mouvements payants seulement dans la fixture`);

console.log(`✓ collecteur vérifié : ${checks} contrôles`);
console.log(`  fixture ${clubs.length} clubs · ${movements.length} mouvements · ${paid.length} avec indemnité · ${loanFees.length} indemnités de prêt`);
console.log('  libellés, blocages, identifiants et montants contrôlés hors réseau');
