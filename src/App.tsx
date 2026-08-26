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
    };
  } catch {
    return null;
  }
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadFreshness().then(setFreshness);
    loadDataset()
      .then((d) => {
        const restored = decode(window.location.hash, d.meta.yearMax);
        setDataset(d);
        if (restored) {
          setFilters(restored.filters);
          setGrouping(restored.grouping);
          setChartMode(restored.chartMode);
          setSort(restored.sort);
          setSelectedKey(restored.selected);
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
    const next = `#${encode({ filters, grouping, chartMode, sort, selected: selectedKey })}`;
    if (next !== window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }, [ready, filters, grouping, chartMode, sort, selectedKey]);

  const patch = useCallback((p: Partial<F>) => {
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
  const groups = useMemo(
    () => sortGroups(group(rows, grouping, filters.includeLoanFees), sort.key, sort.dir),
    [rows, grouping, filters.includeLoanFees, sort],
  );

  const selected = useMemo(
    () => (dataset && selectedKey ? dataset.mercatos.find((m) => m.key === selectedKey) ?? null : null),
    [dataset, selectedKey],
  );

  const onSort = useCallback((key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'label' || key === 'sublabel' ? 1 : -1 }));
  }, []);

  const onGrouping = useCallback((g: Grouping) => {
    setGrouping(g);
    setSort((s) => (g === 'mercato' && s.key === 'count' ? { key: 'volume', dir: -1 } : s));
  }, []);

  const onChartMode = useCallback((mode: ChartMode) => {
    setChartMode(mode);
    setFilters((f) => ({
      ...f,
      window: mode === 'summer' ? 0 : mode === 'winter' ? 1 : 'all',
    }));
  }, []);

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
          groups={groups}
          grouping={grouping}
          sort={sort}
          onSort={onSort}
          onSelect={(g) => g.mercato && setSelectedKey(g.mercato.key)}
          selectedKey={selectedKey ?? undefined}
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
        leurs écarts restent séparés des statistiques financières jusqu’à confirmation.
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
