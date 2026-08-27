/**
 * Exercises the production aggregation module against the complete public
 * dataset. Expected values are recalculated here with deliberately separate
 * implementations so a regression cannot merely validate itself.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bySeason, filterMercatos, group, resolve, sortGroups, totals,
} from '../src/lib/aggregate.ts';
import { titleWeight, trophyFamily } from '../src/lib/honours.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'summary.json'), 'utf8'));
const counts = (row, base) => ({
  total: row[base], paid: row[base + 1], free: row[base + 2], loan: row[base + 3],
  undisclosed: row[base + 4], freeOrLoan: row[base + 5] ?? 0,
  notApplicable: row[base === 8 ? 20 : 21] ?? 0,
  loanFee: row[base === 8 ? 22 : 23] ?? 0,
});
const mercatos = raw.rows.map((row) => ({
  key: `${row[0]}-${row[2]}-${row[3]}`,
  clubId: row[0], club: raw.clubs[row[0]], league: raw.leagues[row[1]],
  year: row[2], window: row[3], spend: row[4], income: row[5],
  loanSpend: row[6], loanIncome: row[7], arrivals: counts(row, 8), departures: counts(row, 14),
}));

const defaults = {
  yearFrom: raw.meta.yearMin,
  yearTo: raw.meta.yearMax,
  window: 'all',
  leagues: [],
  clubs: [],
  balance: 'all',
  minVolume: 0,
  includeLoanFees: false,
};

assert.equal(titleWeight({ competitionCode: 'CL', category: 'championsLeague' }), 10, 'poids Ligue des champions');
assert.equal(titleWeight({ competitionCode: 'PL', category: 'league' }), 6, 'poids Premier League');
assert.equal(titleWeight({ competitionCode: 'PPL', category: 'league' }), 3, 'poids Liga Portugal');
assert.equal(titleWeight({ competitionCode: 'FAC', category: 'domesticCup' }), 2, 'poids coupe nationale');
assert.equal(titleWeight({ competitionCode: 'TDC', category: 'domesticSupercup' }), 0.5, 'poids supercoupe nationale');
assert.equal(trophyFamily('league'), 'league');
assert.equal(trophyFamily('domesticCup'), 'domestic');
assert.equal(trophyFamily('uefaSupercup'), 'continental');

const independentResolve = (mercato, includeLoanFees) => {
  const spend = mercato.spend + (includeLoanFees ? mercato.loanSpend : 0);
  const income = mercato.income + (includeLoanFees ? mercato.loanIncome : 0);
  return { spend, income, balance: income - spend, volume: spend + income };
};

const independentFilter = (filters) => mercatos.filter((mercato) => {
  if (mercato.year < filters.yearFrom || mercato.year > filters.yearTo) return false;
  if (filters.window !== 'all' && mercato.window !== filters.window) return false;
  if (filters.leagues.length && !filters.leagues.includes(mercato.league.id)) return false;
  if (filters.clubs.length && !filters.clubs.includes(mercato.clubId)) return false;
  const resolved = independentResolve(mercato, filters.includeLoanFees);
  if (resolved.volume < filters.minVolume) return false;
  if (filters.balance === 'positive' && resolved.balance <= 0) return false;
  if (filters.balance === 'negative' && resolved.balance >= 0) return false;
  return true;
});

const independentTotals = (rows, includeLoanFees) => {
  const result = {
    spend: 0, income: 0, balance: 0, mercatos: rows.length, clubs: 0,
    arrivals: 0, departures: 0, paidDeals: 0, undisclosed: 0,
  };
  const clubs = new Set();
  for (const mercato of rows) {
    const resolved = independentResolve(mercato, includeLoanFees);
    result.spend += resolved.spend;
    result.income += resolved.income;
    result.arrivals += mercato.arrivals.total;
    result.departures += mercato.departures.total;
    result.paidDeals += mercato.arrivals.paid + mercato.departures.paid
      + (includeLoanFees ? mercato.arrivals.loanFee + mercato.departures.loanFee : 0);
    result.undisclosed += mercato.arrivals.undisclosed + mercato.departures.undisclosed;
    clubs.add(mercato.clubId);
  }
  result.balance = result.income - result.spend;
  result.clubs = clubs.size;
  return result;
};

const independentGroups = (rows, grouping, includeLoanFees) => {
  const result = new Map();
  const latest = new Map();
  const seasonLabel = (year) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  for (const mercato of rows) {
    let key;
    let label;
    let sublabel;
    let flag;
    if (grouping === 'mercato') {
      key = mercato.key;
      label = mercato.club;
      sublabel = `${seasonLabel(mercato.year)} · ${mercato.window === 0 ? 'Été' : 'Hiver'}`;
      flag = mercato.league.code;
    } else if (grouping === 'club') {
      key = String(mercato.clubId);
      label = mercato.club;
      sublabel = mercato.league.name;
      flag = mercato.league.code;
    } else if (grouping === 'league') {
      key = mercato.league.id;
      label = mercato.league.name;
      sublabel = mercato.league.country;
      flag = mercato.league.code;
    } else {
      key = `${mercato.year}-${mercato.window}`;
      label = seasonLabel(mercato.year);
      sublabel = `Mercato d'${mercato.window === 0 ? 'été' : 'hiver'}`;
      flag = mercato.window === 0 ? 'summer' : 'winter';
    }
    if (!result.has(key)) {
      result.set(key, { key, label, sublabel, flag, spend: 0, income: 0, balance: 0, volume: 0, arrivals: 0, departures: 0, knownFees: 0, unknownFees: 0, coverage: 1, count: 0 });
    }
    const target = result.get(key);
    const resolved = independentResolve(mercato, includeLoanFees);
    target.spend += resolved.spend;
    target.income += resolved.income;
    target.arrivals += mercato.arrivals.total;
    target.departures += mercato.departures.total;
    target.knownFees += mercato.arrivals.paid + mercato.departures.paid
      + (includeLoanFees ? mercato.arrivals.loanFee + mercato.departures.loanFee : 0);
    target.unknownFees += mercato.arrivals.undisclosed + mercato.departures.undisclosed;
    target.count += 1;
    if (grouping === 'club') {
      const previous = latest.get(key);
      if (!previous || mercato.year > previous[0] || (mercato.year === previous[0] && mercato.window > previous[1])) {
        latest.set(key, [mercato.year, mercato.window]);
        target.sublabel = mercato.league.name;
        target.flag = mercato.league.code;
      }
    }
  }
  for (const target of result.values()) {
    target.balance = target.income - target.spend;
    target.volume = target.income + target.spend;
    target.coverage = target.knownFees + target.unknownFees ? target.knownFees / (target.knownFees + target.unknownFees) : 1;
  }
  return [...result.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const comparableGroup = ({ key, label, sublabel, flag, spend, income, balance, volume, arrivals, departures, knownFees, unknownFees, coverage, count }) => ({
  key, label, sublabel, flag, spend, income, balance, volume, arrivals, departures, knownFees, unknownFees, coverage, count,
});

const scenarioList = [{ name: 'toutes les données', filters: { ...defaults } }];
for (let year = raw.meta.yearMin; year <= raw.meta.yearMax; year += 4) {
  for (const window of ['all', 0, 1]) {
    for (const balance of ['all', 'positive', 'negative']) {
      for (const includeLoanFees of [false, true]) {
        scenarioList.push({
          name: `${year}/${window}/${balance}/${includeLoanFees}`,
          filters: { ...defaults, yearFrom: year, yearTo: Math.min(year + 3, raw.meta.yearMax), window, balance, includeLoanFees },
        });
      }
    }
  }
}
for (const league of raw.leagues) {
  scenarioList.push({ name: league.id, filters: { ...defaults, leagues: [league.id] } });
}
scenarioList.push({ name: 'plusieurs championnats', filters: { ...defaults, leagues: ['GB1', 'ES1', 'IT1'] } });
for (const minVolume of [1_000, 10_000, 50_000, 100_000]) {
  scenarioList.push({ name: `volume ${minVolume}`, filters: { ...defaults, minVolume } });
}
const sampleClubs = [...new Set(mercatos.filter((_, index) => index % 997 === 0).map((mercato) => mercato.clubId))].slice(0, 12);
for (const clubId of sampleClubs) {
  scenarioList.push({ name: `club ${clubId}`, filters: { ...defaults, clubs: [clubId] } });
}
scenarioList.push({ name: 'plusieurs clubs', filters: { ...defaults, clubs: sampleClubs.slice(0, 4) } });

let checkedScenarios = 0;
for (const { name, filters } of scenarioList) {
  const actualRows = filterMercatos(mercatos, filters);
  const expectedRows = independentFilter(filters);
  assert.deepEqual(actualRows.map((row) => row.key), expectedRows.map((row) => row.key), `filtre ${name}`);
  assert.deepEqual(totals(actualRows, filters.includeLoanFees), independentTotals(expectedRows, filters.includeLoanFees), `totaux ${name}`);

  const expectedTotals = independentTotals(expectedRows, filters.includeLoanFees);
  for (const grouping of ['mercato', 'club', 'league', 'season']) {
    const groups = group(actualRows, grouping, filters.includeLoanFees);
    assert.deepEqual(
      groups.map(comparableGroup).sort((a, b) => a.key.localeCompare(b.key)),
      independentGroups(expectedRows, grouping, filters.includeLoanFees),
      `contenu des groupes ${name}/${grouping}`,
    );
    assert.equal(new Set(groups.map((item) => item.key)).size, groups.length, `clés de groupe ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.spend, 0), expectedTotals.spend, `achats ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.income, 0), expectedTotals.income, `ventes ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.balance, 0), expectedTotals.balance, `bilans ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.volume, 0), expectedTotals.spend + expectedTotals.income, `volumes ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.arrivals, 0), expectedTotals.arrivals, `arrivées ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.departures, 0), expectedTotals.departures, `départs ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.knownFees, 0), expectedTotals.paidDeals, `montants connus ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.unknownFees, 0), expectedTotals.undisclosed, `montants inconnus ${name}/${grouping}`);
    assert.equal(groups.reduce((sum, item) => sum + item.count, 0), actualRows.length, `comptage ${name}/${grouping}`);
    for (const item of groups) {
      assert.equal(item.balance, item.income - item.spend, `formule bilan ${name}/${grouping}/${item.key}`);
      assert.equal(item.volume, item.income + item.spend, `formule volume ${name}/${grouping}/${item.key}`);
    }
  }
  checkedScenarios += 1;
}

// Club labels must remain identical even if a caller supplies rows in reverse.
const normalClubs = group(mercatos, 'club', false).sort((a, b) => a.key.localeCompare(b.key));
const reversedClubs = group([...mercatos].reverse(), 'club', false).sort((a, b) => a.key.localeCompare(b.key));
assert.deepEqual(
  reversedClubs.map(({ key, label, sublabel, flag }) => ({ key, label, sublabel, flag })),
  normalClubs.map(({ key, label, sublabel, flag }) => ({ key, label, sublabel, flag })),
  'le championnat récent du regroupement club ne doit pas dépendre de l’ordre source',
);

const allGroups = group(mercatos, 'mercato', false);
for (const key of ['label', 'sublabel', 'spend', 'income', 'balance', 'volume', 'arrivals', 'departures', 'coverage', 'count']) {
  for (const dir of [1, -1]) {
    const originalKeys = allGroups.map((item) => item.key);
    const sorted = sortGroups(allGroups, key, dir);
    assert.deepEqual(allGroups.map((item) => item.key), originalKeys, `le tri ${key}/${dir} ne doit pas muter sa source`);
    for (let index = 1; index < sorted.length; index++) {
      const before = sorted[index - 1];
      const after = sorted[index];
      const primary = key === 'label' || key === 'sublabel'
        ? before[key].localeCompare(after[key], 'fr') * dir
        : (before[key] - after[key]) * dir;
      assert.ok(primary <= 0, `ordre primaire ${key}/${dir}`);
      if (primary === 0) {
        const secondary = key === 'label' || key === 'sublabel'
          ? before.key.localeCompare(after.key, 'fr')
          : before.label.localeCompare(after.label, 'fr') || before.key.localeCompare(after.key, 'fr');
        assert.ok(secondary <= 0, `ordre secondaire ${key}/${dir}`);
      }
    }
  }
}

const expectedChart = (mode) => {
  const map = new Map();
  for (const mercato of mercatos) {
    if (mode === 'summer' && mercato.window !== 0) continue;
    if (mode === 'winter' && mercato.window !== 1) continue;
    const key = mode === 'annual' ? String(mercato.year) : `${mercato.year}-${mercato.window}`;
    const current = map.get(key) ?? { spend: 0, income: 0 };
    current.spend += mercato.spend;
    current.income += mercato.income;
    map.set(key, current);
  }
  return map;
};
for (const mode of ['annual', 'summer', 'winter', 'split']) {
  const points = bySeason(mercatos, false, mode);
  const expected = expectedChart(mode);
  assert.equal(points.length, expected.size, `nombre de points ${mode}`);
  for (const point of points) {
    const key = mode === 'annual' ? String(point.year) : `${point.year}-${point.window}`;
    assert.deepEqual(
      { spend: point.spend, income: point.income, balance: point.balance },
      { ...expected.get(key), balance: expected.get(key).income - expected.get(key).spend },
      `point graphique ${mode}/${key}`,
    );
  }
}

const withoutLoans = totals(mercatos, false);
const withLoans = totals(mercatos, true);
assert.equal(withLoans.spend - withoutLoans.spend, mercatos.reduce((sum, item) => sum + item.loanSpend, 0), 'indemnités de prêt versées');
assert.equal(withLoans.income - withoutLoans.income, mercatos.reduce((sum, item) => sum + item.loanIncome, 0), 'indemnités de prêt perçues');
for (const mercato of mercatos) assert.deepEqual(resolve(mercato, true), independentResolve(mercato, true));

console.log(`✓ analytique : ${checkedScenarios} scénarios de filtres · 4 regroupements · 20 tris · 4 modes graphiques`);
console.log(`  ${mercatos.length} mercatos contrôlés, avec et sans indemnités de prêt · barème du palmarès vérifié`);
