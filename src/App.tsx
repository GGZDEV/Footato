import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from './components/DataTable';
import { BrandMark } from './components/BrandMark';
import { Filters } from './components/Filters';
import { Kpis } from './components/Kpis';
import { MercatoDetail } from './components/MercatoDetail';
import { SeasonChart } from './components/SeasonChart';
import {
  bySeason, filterMercatos, group, sortGroups, totals,
  type ChartMode, type Filters as F, type Grouping, type SortKey,
} from './lib/aggregate';
import { loadDataset, loadFreshness } from './lib/data';
import { season } from './lib/format';
import type { Dataset, FreshnessData, FreshnessSignal } from './lib/types';

const TABS: { value: Grouping; label: string; hint: string }[] = [
  { value: 'mercato', label: 'Mercatos', hint: 'Une ligne par club et par fenêtre de transfert' },
  { value: 'club', label: 'Clubs', hint: 'Cumul sur toute la période filtrée' },
  { value: 'league', label: 'Championnats', hint: 'Cumul par championnat' },
  { value: 'season', label: 'Saisons', hint: 'Cumul par fenêtre de transfert' },
];

const CHART_MODES: { value: ChartMode; label: string; title: string }[] = [
  { value: 'annual', label: 'Année', title: 'Fusionner été et hiver par saison' },
  { value: 'summer', label: 'Été', title: 'Afficher uniquement les mercatos d’été' },
  { value: 'winter', label: 'Hiver', title: 'Afficher uniquement les mercatos d’hiver' },
  { value: 'split', label: 'Séparés', title: 'Afficher été et hiver séparément' },
];

const defaults = (yearMax: number): F => ({
  yearFrom: 2000,
  yearTo: yearMax,
  window: 'all',
  leagues: [],
  clubs: [],
  balance: 'all',
  minVolume: 0,
  includeLoanFees: false,
});

interface UrlState {
  filters: F;
  grouping: Grouping;
  chartMode: ChartMode;
  sort: { key: SortKey; dir: 1 | -1 };
  selected: string | null;
  limit: number | null;
  titleFilter: 'all' | 'with' | 'without';
}

function encode(s: UrlState): string {
  const p = new URLSearchParams();
  const f = s.filters;
  p.set('y', `${f.yearFrom}-${f.yearTo}`);
  if (f.window !== 'all') p.set('w', String(f.window));
  if (f.leagues.length) p.set('l', f.leagues.join(','));
  if (f.clubs.length) p.set('c', f.clubs.join(','));
  if (f.balance !== 'all') p.set('b', f.balance);
  if (f.minVolume) p.set('v', String(f.minVolume));
  if (f.includeLoanFees) p.set('lf', '1');
  if (s.grouping !== 'mercato') p.set('g', s.grouping);
  if (s.chartMode !== 'split') p.set('cm', s.chartMode);
  p.set('s', `${s.sort.key}:${s.sort.dir}`);
  if (s.selected) p.set('m', s.selected);
  if (s.limit) p.set('top', String(s.limit));
  if (s.titleFilter !== 'all') p.set('tf', s.titleFilter);
  return p.toString();
}

function decode(hash: string, yearMax: number): UrlState | null {
  if (!hash || hash.length < 2) return null;
  try {
    const p = new URLSearchParams(hash.slice(1));
    const f = defaults(yearMax);
    const y = p.get('y')?.split('-').map(Number);
    if (y?.length === 2 && y.every(Number.isFinite)) { f.yearFrom = y[0]; f.yearTo = y[1]; }
    const w = p.get('w');
    if (w === '0' || w === '1') f.window = Number(w) as 0 | 1;
    if (p.get('l')) f.leagues = p.get('l')!.split(',').filter(Boolean);
    if (p.get('c')) f.clubs = p.get('c')!.split(',').map(Number).filter(Number.isFinite);
    const b = p.get('b');
    if (b === 'positive' || b === 'negative') f.balance = b;
    f.minVolume = Number(p.get('v')) || 0;
    f.includeLoanFees = p.get('lf') === '1';

    const g = p.get('g') as Grouping | null;
    const requestedChartMode = p.get('cm') as ChartMode | null;
    const chartMode = requestedChartMode && CHART_MODES.some((mode) => mode.value === requestedChartMode)
      ? requestedChartMode
      : f.window === 0 ? 'summer' : f.window === 1 ? 'winter' : 'split';
    f.window = chartMode === 'summer' ? 0 : chartMode === 'winter' ? 1 : 'all';
    const [sk, sd] = (p.get('s') ?? 'volume:-1').split(':');
    return {
      filters: f,
      grouping: g && TABS.some((t) => t.value === g) ? g : 'mercato',
      chartMode,
      sort: { key: (sk || 'volume') as SortKey, dir: sd === '1' ? 1 : -1 },
      selected: p.get('m'),
      limit: [10, 20].includes(Number(p.get('top'))) ? Number(p.get('top')) : null,
      titleFilter: p.get('tf') === 'with' || p.get('tf') === 'without' ? p.get('tf') as 'with' | 'without' : 'all',
    };
  } catch {
    return null;
  }
}

function restoreClubAliases(state: UrlState, dataset: Dataset): UrlState {
  const redirects = new Map(dataset.meta.quality.clubAliases.map((alias) => [alias.fromId, alias.toId]));
  state.filters.clubs = [...new Set(state.filters.clubs.map((id) => redirects.get(id) ?? id))];
  if (state.selected) {
    const [clubId, ...rest] = state.selected.split('-');
    const redirected = redirects.get(Number(clubId));
    if (redirected != null) state.selected = [redirected, ...rest].join('-');
  }
  return state;
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [freshness, setFreshness] = useState<FreshnessData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<F>(defaults(2026));
  const [grouping, setGrouping] = useState<Grouping>('mercato');
  const [chartMode, setChartMode] = useState<ChartMode>('split');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'volume', dir: -1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [rankingLimit, setRankingLimit] = useState<number | null>(null);
  const [titleFilter, setTitleFilter] = useState<'all' | 'with' | 'without'>('all');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadFreshness().then(setFreshness);
    loadDataset()
      .then((d) => {
        const decoded = decode(window.location.hash, d.meta.yearMax);
        const restored = decoded ? restoreClubAliases(decoded, d) : null;
        setDataset(d);
        if (restored) {
          setFilters(restored.filters);
          setGrouping(restored.grouping);
          setChartMode(restored.chartMode);
          setSort(restored.sort);
          setSelectedKey(restored.selected);
          setRankingLimit(restored.limit);
          setTitleFilter(restored.titleFilter);
        } else {
          setFilters(defaults(d.meta.yearMax));
        }
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Keep the address bar in sync so any view can be bookmarked or shared.
  useEffect(() => {
    if (!ready) return;
    const next = `#${encode({ filters, grouping, chartMode, sort, selected: selectedKey, limit: rankingLimit, titleFilter })}`;
    if (next !== window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }, [ready, filters, grouping, chartMode, sort, selectedKey, rankingLimit, titleFilter]);

  const patch = useCallback((p: Partial<F>) => {
    setRankingLimit(null);
    setTitleFilter('all');
    setFilters((f) => ({ ...f, ...p }));
    if (p.window === 0) setChartMode('summer');
    else if (p.window === 1) setChartMode('winter');
    else if (p.window === 'all') setChartMode((mode) => (mode === 'summer' || mode === 'winter' ? 'split' : mode));
  }, []);

  const refreshFreshness = useCallback(async () => {
    setRefreshing(true);
    setFreshness(await loadFreshness(true));
    setRefreshing(false);
  }, []);
  const reset = useCallback(() => {
    if (dataset) {
      setFilters(defaults(dataset.meta.yearMax));
      setChartMode('split');
      setRankingLimit(null);
      setTitleFilter('all');
    }
  }, [dataset]);

  const rows = useMemo(
    () => (dataset ? filterMercatos(dataset.mercatos, filters) : []),
    [dataset, filters],
  );
  const t = useMemo(() => totals(rows, filters.includeLoanFees), [rows, filters.includeLoanFees]);
  const points = useMemo(
    () => bySeason(rows, filters.includeLoanFees, chartMode),
    [rows, filters.includeLoanFees, chartMode],
  );
  const honoursReady = freshness?.honours?.meta.status === 'ready';
  const honoursComparable = honoursReady
    && freshness.honours.meta.commonYearMin != null
    && freshness.honours.meta.commonYearMax != null
    && filters.yearFrom >= freshness.honours.meta.commonYearMin
    && filters.yearTo <= freshness.honours.meta.commonYearMax;
  const groups = useMemo(() => {
    const baseGroups = group(rows, grouping, filters.includeLoanFees);
    if (grouping === 'club' && honoursComparable) {
      const titles = new Map<number, { domestic: number; continental: number }>();
      for (const title of freshness.honours.titles) {
        const clubId = title.winner.clubId;
        if (clubId == null || title.season < filters.yearFrom || title.season > filters.yearTo) continue;
        const current = titles.get(clubId) ?? { domestic: 0, continental: 0 };
        current[title.kind] += 1;
        titles.set(clubId, current);
      }
      for (const item of baseGroups) {
        const titleCounts = titles.get(Number(item.key)) ?? { domestic: 0, continental: 0 };
        item.domesticTitles = titleCounts.domestic;
        item.continentalTitles = titleCounts.continental;
        item.titles = titleCounts.domestic + titleCounts.continental;
        item.spendPerTitle = item.titles ? item.spend / item.titles : Number.POSITIVE_INFINITY;
      }
    }
    return sortGroups(baseGroups, sort.key, sort.dir);
  }, [rows, grouping, filters.includeLoanFees, filters.yearFrom, filters.yearTo, sort, freshness, honoursComparable]);
  const titleFilteredGroups = useMemo(
    () => titleFilter === 'all' ? groups : groups.filter((item) => titleFilter === 'with' ? (item.titles ?? 0) > 0 : (item.titles ?? 0) === 0),
    [groups, titleFilter],
  );

  const selected = useMemo(
    () => (dataset && selectedKey ? dataset.mercatos.find((m) => m.key === selectedKey) ?? null : null),
    [dataset, selectedKey],
  );

  const onSort = useCallback((key: SortKey) => {
    setRankingLimit(null);
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'label' || key === 'sublabel' ? 1 : -1 }));
  }, []);

  const onGrouping = useCallback((g: Grouping) => {
    setRankingLimit(null);
    setTitleFilter('all');
    setGrouping(g);
    setSort((s) => (g === 'mercato' && s.key === 'count' ? { key: 'volume', dir: -1 } : s));
  }, []);

  const onChartMode = useCallback((mode: ChartMode) => {
    setRankingLimit(null);
    setChartMode(mode);
    setFilters((f) => ({
      ...f,
      window: mode === 'summer' ? 0 : mode === 'winter' ? 1 : 'all',
    }));
  }, []);

  const applyRanking = useCallback((preset: 'spend-decade' | 'profit' | 'income' | 'coverage' | 'titles' | 'efficient' | 'no-title') => {
    if (!dataset) return;
    const base = defaults(dataset.meta.yearMax);
    setTitleFilter('all');
    if (preset === 'spend-decade') {
      setFilters({ ...base, yearFrom: Math.floor(dataset.meta.yearMax / 10) * 10 });
      setGrouping('club'); setSort({ key: 'spend', dir: -1 }); setRankingLimit(10);
    } else if (preset === 'profit') {
      setFilters({ ...base, balance: 'positive' });
      setGrouping('club'); setSort({ key: 'balance', dir: -1 }); setRankingLimit(20);
    } else if (preset === 'income') {
      setFilters(base);
      setGrouping('club'); setSort({ key: 'income', dir: -1 }); setRankingLimit(10);
    } else if (preset === 'coverage') {
      setFilters(base);
      setGrouping('league'); setSort({ key: 'coverage', dir: -1 }); setRankingLimit(null);
    } else {
      const honourStart = Math.max(2000, freshness?.honours?.meta.commonYearMin ?? 2000);
      const honourEnd = freshness?.honours?.meta.commonYearMax ?? base.yearTo;
      setFilters({ ...base, yearFrom: honourStart, yearTo: honourEnd });
      setGrouping('club');
      if (preset === 'titles') setSort({ key: 'titles', dir: -1 });
      else if (preset === 'efficient') { setSort({ key: 'spendPerTitle', dir: 1 }); setTitleFilter('with'); }
      else { setSort({ key: 'spend', dir: -1 }); setTitleFilter('without'); }
      setRankingLimit(20);
    }
    setChartMode('split');
    setSelectedKey(null);
  }, [dataset, freshness]);

  if (error) {
    return (
      <div className="center-state">
        <div className="error-box">
          <strong>Les données n’ont pas pu être chargées.</strong>
          <p style={{ marginBottom: 0 }}>{error}</p>
          <code>npm run data</code>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return <div className="center-state"><span className="ball">⚽</span>Chargement des mercatos…</div>;
  }

  const { meta } = dataset;
  const tab = TABS.find((x) => x.value === grouping)!;
  const currentDate = new Date();
  const currentSeasonYear = currentDate.getMonth() >= 6 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;
  const laggingLeagues = dataset.leagues.filter(
    (league) => (meta.coverageByLeague[league.id]?.yearMax ?? -Infinity) < meta.yearMax,
  );
  const sourceDate = meta.sourceUpdatedAt
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(`${meta.sourceUpdatedAt}T12:00:00Z`))
    : 'date inconnue';
  const rosterDate = freshness?.meta.status === 'ready' && freshness.meta.fetchedAt
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        .format(new Date(freshness.meta.fetchedAt))
    : 'en attente';
  const rosterTitle = freshness?.meta.status === 'ready'
    ? `Effectifs football-data.org contrôlés le ${new Date(freshness.meta.fetchedAt!).toLocaleString('fr-FR')} · ${freshness.meta.teamCount} équipes · ${freshness.meta.playerCount.toLocaleString('fr-FR')} joueurs. Ce bouton recharge le dernier relevé publié.`
    : 'Le premier relevé football-data.org sera créé par le prochain déploiement GitHub Actions.';
  const visibleSignals = freshness?.signals.slice(0, 8) ?? [];
  const decadeStart = Math.floor(meta.yearMax / 10) * 10;

  return (
    <div className="app">
      <header className="hero-header">
        <div className="brand-row">
          <div className="brand">
            <BrandMark />
            <div>
              <h1>Footato</h1>
              <span>Football transfer intelligence</span>
            </div>
          </div>
          <div className="data-status" aria-label="État des sources">
            <div className="freshness source-money" title={`Dernière modification de la source des montants : ${meta.sourceUpdatedAt ?? 'inconnue'}`}>
              <i aria-hidden="true" />
              <span><span className="freshness-label">Montants · </span>{sourceDate}</span>
            </div>
            <button
              className="freshness source-rosters"
              title={rosterTitle}
              onClick={refreshFreshness}
              disabled={refreshing}
              aria-label={`${rosterTitle} Recharger maintenant.`}
            >
              <i aria-hidden="true" />
              <span><span className="freshness-label">Effectifs · </span>{refreshing ? 'vérification…' : rosterDate}</span>
              <b aria-hidden="true">↻</b>
            </button>
          </div>
        </div>

        <div className="hero-metrics" aria-label="Périmètre des données">
          <div><strong>{meta.movementCount.toLocaleString('fr-FR')}</strong><span>mouvements</span></div>
          <div><strong>{meta.clubCount}</strong><span>clubs</span></div>
          <div><strong>{dataset.leagues.length}</strong><span>championnats</span></div>
          <div><strong>{season(meta.yearMin)} — {season(meta.yearMax)}</strong><span>couverture</span></div>
        </div>
      </header>

      <section className="panel ranking-presets" aria-labelledby="ranking-presets-title">
        <div className="panel-head">
          <div>
            <h2 id="ranking-presets-title">Classements prêts à l’emploi</h2>
            <p>Chaque vue conserve son URL et affiche sa complétude</p>
          </div>
        </div>
        <div className="preset-grid">
          <button onClick={() => applyRanking('spend-decade')}>
            <span>Top 10</span><strong>Dépenses depuis {decadeStart}</strong><small>Clubs · achats décroissants</small>
          </button>
          <button onClick={() => applyRanking('profit')}>
            <span>Top 20</span><strong>Plus gros bénéfices</strong><small>Clubs · ventes moins achats</small>
          </button>
          <button onClick={() => applyRanking('income')}>
            <span>Top 10</span><strong>Plus grosses ventes</strong><small>Clubs · recettes documentées</small>
          </button>
          <button onClick={() => applyRanking('coverage')}>
            <span>Audit</span><strong>Fiabilité par championnat</strong><small>Montants publics vs inconnus</small>
          </button>
          {honoursReady && <>
            <button onClick={() => applyRanking('titles')}>
              <span>Palmarès</span><strong>Plus titrés depuis 2000</strong><small>Championnats + Ligue des champions</small>
            </button>
            <button onClick={() => applyRanking('efficient')}>
              <span>Efficacité</span><strong>Moins dépensé par titre</strong><small>Achats documentés ÷ titres suivis</small>
            </button>
            <button onClick={() => applyRanking('no-title')}>
              <span>Sans titre</span><strong>Plus gros dépensiers</strong><small>Aucun titre majeur suivi sur la période</small>
            </button>
          </>}
        </div>
      </section>

      <Filters dataset={dataset} filters={filters} onChange={patch} onReset={reset} />

      {freshness?.meta.status === 'ready' && visibleSignals.length > 0 && (
        <section className="panel roster-signals" aria-labelledby="roster-signals-title">
          <div className="panel-head">
            <div>
              <h2 id="roster-signals-title">Changements d’effectif détectés</h2>
              <p>Signaux football-data.org à confirmer — exclus des montants et agrégats</p>
            </div>
            <span className="signal-count">{freshness.meta.signalCount} sur 30 jours</span>
          </div>
          <div className="signal-grid">
            {visibleSignals.map((signal: FreshnessSignal) => (
              <article className={`signal-card signal-${signal.kind}`} key={`${signal.kind}-${signal.playerId}-${signal.fromTeam?.id ?? 0}-${signal.toTeam?.id ?? 0}`}>
                <strong>{signal.playerName}</strong>
                <span>{signal.fromTeam?.name ?? 'Nouveau dans le périmètre'} <b aria-hidden="true">→</b> {signal.toTeam?.name ?? 'Sorti du périmètre'}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      <Kpis t={t} />

      {grouping === 'club' && honoursComparable && (
        <div className="honours-scope" role="note">
          <strong>Palmarès comparable :</strong> championnats de première division des sept pays et Ligue des champions,
          de {filters.yearFrom} à {filters.yearTo}, période couverte par les huit compétitions.
          Coupes nationales et autres compétitions exclues. {freshness.honours.meta.unmatchedTitleCount > 0 && `${freshness.honours.meta.unmatchedTitleCount} titre(s) non rattaché(s) à un club Footato.`}
        </div>
      )}

      <section className="panel">
        <div className="panel-head chart-panel-head">
          <h2>Achats et ventes dans le temps</h2>
          <p>Cliquez un point pour filtrer la vue</p>
          <div className="spacer" />
          <div className="segmented chart-modes" role="group" aria-label="Affichage du graphique">
            {CHART_MODES.map((mode) => (
              <button
                key={mode.value}
                aria-pressed={chartMode === mode.value}
                onClick={() => onChartMode(mode.value)}
                title={mode.title}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <SeasonChart
          points={points}
          onSelect={(p) => patch({ yearFrom: p.year, yearTo: p.year, window: p.window })}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="segmented view-tabs" role="group" aria-label="Regroupement">
            {TABS.map((x) => (
              <button key={x.value} aria-pressed={grouping === x.value} onClick={() => onGrouping(x.value)}>
                {x.label}
              </button>
            ))}
          </div>
          <p>{tab.hint}</p>
        </div>
        <DataTable
          groups={rankingLimit ? titleFilteredGroups.slice(0, rankingLimit) : titleFilteredGroups}
          grouping={grouping}
          sort={sort}
          onSort={onSort}
          onSelect={(g) => g.mercato && setSelectedKey(g.mercato.key)}
          selectedKey={selectedKey ?? undefined}
          showHonours={grouping === 'club' && honoursComparable}
        />
      </section>

      <footer className="source-note" style={{ textAlign: 'left', paddingTop: 8 }}>
        Montants en euros, tels que publiés par Transfermarkt. Les transferts dont le montant n’a pas été
        divulgué comptent comme 0 € : le total réel est donc un plancher, pas une valeur exacte.
        {laggingLeagues.length > 0 && (
          <> Couverture récente indisponible pour {laggingLeagues.map((league) => league.name).join(', ')} ;
          leur historique est conservé sans extrapolation.</>
        )}{' '}
        {meta.yearMax < currentSeasonYear && (
          <>La saison {season(currentSeasonYear)} n’est pas publiée tant que l’amont ne permet pas
          de rattacher les clubs à leur championnat avec fiabilité.</>
        )}{' '}
        Les effectifs de sept championnats et de la Ligue des champions sont contrôlés automatiquement via{' '}
        <a href="https://www.football-data.org/" target="_blank" rel="noreferrer">football-data.org</a> ;
        leurs écarts restent séparés des statistiques financières jusqu’à confirmation. Le palmarès comparable
        ne compte que les sept championnats nationaux suivis et la Ligue des champions, jamais les coupes non couvertes.
      </footer>

      {selected && (
        <MercatoDetail
          mercato={selected}
          dataset={dataset}
          includeLoanFees={filters.includeLoanFees}
          onSelect={(m) => setSelectedKey(m.key)}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}
