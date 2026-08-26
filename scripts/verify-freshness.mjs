import assert from 'node:assert/strict';
import { diffSnapshots, finaliseSnapshot, normaliseHonours, normaliseSnapshot } from './lib/freshness.mjs';
import { buildHonoursCatalog } from './lib/honours-catalog.mjs';

const competition = (code, teams) => ({
  code,
  payload: {
    competition: { code, name: code },
    season: { startDate: '2026-08-01' },
    teams,
  },
});
const player = (id, name) => ({ id, name, position: 'Midfield', nationality: 'France' });
const team = (id, name, squad) => ({ id, name, shortName: name, tla: name.slice(0, 3), squad, lastUpdated: '2026-08-25T10:00:00Z' });

const before = normaliseSnapshot([
  competition('PL', [team(1, 'Alpha', [player(10, 'Alice'), player(11, 'Bob')]), team(2, 'Beta', [])]),
  competition('CL', [team(1, 'Alpha', [player(10, 'Alice'), player(11, 'Bob'), player(99, 'Effectif européen obsolète')])]),
], '2026-08-25T12:00:00Z');

assert.equal(before.meta.teamCount, 2, 'une équipe présente dans deux compétitions doit être fusionnée');
assert.equal(before.meta.playerCount, 2, 'les joueurs de Ligue des champions ne doivent pas être dupliqués');
assert.equal(before.teams[0].players.some((item) => item.id === 99), false, 'l’effectif domestique doit primer sur la liste européenne');
assert.deepEqual(before.teams[0].competitions, ['CL', 'PL']);

const after = normaliseSnapshot([
  competition('PL', [team(1, 'Alpha', [player(11, 'Bob')]), team(2, 'Beta', [player(10, 'Alice'), player(12, 'Chloé')])]),
], '2026-08-26T12:00:00Z');
const changes = diffSnapshots(before, after);
assert.equal(changes.filter((signal) => signal.kind === 'moved').length, 1);
assert.equal(changes.find((signal) => signal.kind === 'moved').playerName, 'Alice');
assert.equal(changes.filter((signal) => signal.kind === 'added').length, 1);

const final = finaliseSnapshot(after, before);
assert.equal(final.meta.isBaseline, false);
assert.equal(final.meta.previousFetchedAt, before.meta.fetchedAt);
assert.equal(final.meta.newSignalCount, 2);
assert.equal(final.meta.signalCount, 2);

const baseline = finaliseSnapshot(before, { meta: { status: 'pending' }, signals: [] });
assert.equal(baseline.meta.isBaseline, true);
assert.equal(baseline.signals.length, 0, 'le premier relevé ne doit pas inventer des mouvements');

const ambiguousBefore = normaliseSnapshot([
  competition('PL', [team(1, 'Alpha', [player(20, 'Doublon')]), team(2, 'Beta', [player(20, 'Doublon')])]),
], '2026-08-25T12:00:00Z');
const ambiguousAfter = normaliseSnapshot([
  competition('PL', [team(2, 'Beta', [player(20, 'Doublon')])]),
], '2026-08-26T12:00:00Z');
assert.equal(diffSnapshots(ambiguousBefore, ambiguousAfter).length, 0, 'un joueur ambigu ne doit pas générer un signal');

const honours = normaliseHonours([
  { code: 'PL', payload: { name: 'Premier League', seasons: [
    { startDate: '2024-08-01', winner: { id: 1, name: 'Manchester City FC' } },
    { startDate: '2025-08-01', winner: null },
  ] } },
  { code: 'CL', payload: { name: 'UEFA Champions League', seasons: [
    { startDate: '2024-08-01', winner: { id: 2, name: 'Real Madrid CF' } },
  ] } },
], {
  meta: { yearMin: 1992, yearMax: 2026 },
  clubs: ['Manchester City', 'Real Madrid'],
  rows: [[0], [1]],
}, '2026-08-26T12:00:00Z');
assert.equal(honours.meta.titleCount, 2);
assert.equal(honours.meta.matchedTitleCount, 2);
assert.deepEqual(honours.titles.map((title) => title.winner.clubId), [1, 0]);

const realSummary = JSON.parse(await (await import('node:fs/promises')).readFile(
  new URL('../public/data/summary.json', import.meta.url), 'utf8',
));
const apiCrossCheck = normaliseHonours([
  { code: 'PL', payload: { name: 'Premier League', seasons: [
    { startDate: '2022-08-01', winner: { id: 65, name: 'Manchester City FC' } },
  ] } },
], realSummary, '2026-08-26T12:00:00Z');
const catalog = buildHonoursCatalog(realSummary, apiCrossCheck, '2026-08-26T12:00:00Z');
assert.equal(catalog.meta.titleCount, 198);
assert.equal(catalog.meta.matchedTitleCount, 198);
assert.equal(catalog.meta.unmatchedTitleCount, 0);
assert.equal(catalog.meta.crossCheckedTitleCount, 1);
assert.equal(catalog.meta.commonYearMin, 2000);
assert.equal(catalog.meta.commonYearMax, 2024);
assert.deepEqual(
  catalog.coverage.flatMap((item) => item.missingSeasons.map((season) => `${item.code}:${season.season}`)),
  ['DED:2019', 'SA:2004'],
);

console.log('Détection vérifiée : fusion, baseline, mouvements, ambiguïtés et palmarès comparable.');
