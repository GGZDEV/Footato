import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { CompletenessView } from './components/CompletenessView';
import { DataTable } from './components/DataTable';
import { Filters } from './components/Filters';
import { HonoursView } from './components/HonoursView';
import { Kpis } from './components/Kpis';
import { MercatoDetail } from './components/MercatoDetail';
import { SeasonChart } from './components/SeasonChart';
import { ThemeToggle } from './components/ThemeToggle';
import {
  bySeason,
  filterMercatos,
  group,
  groupAnnualMercatos,
  sortGroups,
  totals,
  type Filters as F,
  type Group,
  type Grouping,
  type SortKey,
} from './lib/aggregate';
import { loadDataset, loadFreshness } from './lib/data';
import { season } from './lib/format';
import { titleWeight, trophyFamily, type TitlePointBreakdown } from './lib/honours';
import type { Dataset, FreshnessData } from './lib/types';

type AppSection = 'market' | 'honours' | 'coverage';
type QuickView = 'overview' | 'spend-decade' | 'profit' | 'income' | null;

const GROUPINGS: { value: Grouping; label: string; hint: string }[] = [
  { value: 'mercato', label: 'Mercatos', hint: 'Un club et une saison par ligne' },
  { value: 'club', label: 'Clubs', hint: 'Cumul sur la période' },
  { value: 'league', label: 'Championnats', hint: 'Cumul par championnat' },
  { value: 'season', label: 'Saisons', hint: 'Été et hiver séparés' },
];

const SECTIONS: { value: AppSection; label: string }[] = [
  { value: 'market', label: 'Marché' },
  { value: 'honours', label: 'Palmarès' },
  { value: 'coverage', label: 'Complétude' },
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
  sort: { key: SortKey; dir: 1 | -1 };
  selected: string | null;
  section: AppSection;
}

function encode(state: UrlState): string {
  const params = new URLSearchParams();
  const { filters } = state;
  params.set('y', `${filters.yearFrom}-${filters.yearTo}`);
  if (filters.window !== 'all') params.set('w', String(filters.window));
  if (filters.leagues.length) params.set('l', filters.leagues.join(','));
  if (filters.clubs.length) params.set('c', filters.clubs.join(','));
  if (filters.balance !== 'all') params.set('b', filters.balance);
  if (filters.minVolume) params.set('v', String(filters.minVolume));
  if (filters.includeLoanFees) params.set('lf', '1');
  if (state.grouping !== 'mercato') params.set('g', state.grouping);
  if (state.section !== 'market') params.set('p', state.section);
  params.set('s', `${state.sort.key}:${state.sort.dir}`);
  if (state.selected) params.set('m', state.selected);
  return params.toString();
}

function decode(hash: string, yearMax: number): UrlState | null {
  if (!hash || hash.length < 2) return null;
  try {
    const params = new URLSearchParams(hash.slice(1));
    const filters = defaults(yearMax);
    const range = params.get('y')?.split('-').map(Number);
    if (range?.length === 2 && range.every(Number.isFinite)) [filters.yearFrom, filters.yearTo] = range;
    const window = params.get('w');
    if (window === '0' || window === '1') filters.window = Number(window) as 0 | 1;
    if (params.get('l')) filters.leagues = params.get('l')!.split(',').filter(Boolean);
    if (params.get('c')) filters.clubs = params.get('c')!.split(',').map(Number).filter(Number.isFinite);
    const balance = params.get('b');
    if (balance === 'positive' || balance === 'negative') filters.balance = balance;
    filters.minVolume = Number(params.get('v')) || 0;
    filters.includeLoanFees = params.get('lf') === '1';
    const requestedGrouping = params.get('g') as Grouping | null;
    const requestedSection = params.get('p') as AppSection | null;
    const [sortKey, sortDirection] = (params.get('s') ?? 'volume:-1').split(':');
    return {
      filters,
      grouping: requestedGrouping && GROUPINGS.some((item) => item.value === requestedGrouping) ? requestedGrouping : 'mercato',
      section: requestedSection && SECTIONS.some((item) => item.value === requestedSection) ? requestedSection : 'market',
      sort: { key: (sortKey || 'volume') as SortKey, dir: sortDirection === '1' ? 1 : -1 },
      selected: params.get('m'),
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
  const [ready, setReady] = useState(false);

  const [section, setSection] = useState<AppSection>('market');
  const [filters, setFilters] = useState<F>(defaults(2026));
  const [grouping, setGrouping] = useState<Grouping>('mercato');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'volume', dir: -1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [quickView, setQuickView] = useState<QuickView>('overview');
  const [honourFrom, setHonourFrom] = useState(2000);
  const [honourTo, setHonourTo] = useState(2024);
  const [honourPeriodReady, setHonourPeriodReady] = useState(false);

  useEffect(() => {
    loadFreshness().then(setFreshness);
    loadDataset()
      .then((loaded) => {
        const restored = decode(window.location.hash, loaded.meta.yearMax);
        setDataset(loaded);
        if (restored) {
          const state = restoreClubAliases(restored, loaded);
          setFilters(state.filters);
          setGrouping(state.grouping);
          setSort(state.sort);
          setSelectedKey(state.selected);
          setSection(state.section);
          setQuickView(null);
        } else {
          setFilters(defaults(loaded.meta.yearMax));
        }
        setReady(true);
      })
      .catch((caught: Error) => setError(caught.message));
  }, []);

  useEffect(() => {
    if (honourPeriodReady || freshness?.honours?.meta.status !== 'ready') return;
    setHonourFrom(Math.max(2000, freshness.honours.meta.commonYearMin ?? 2000));
    setHonourTo(freshness.honours.meta.commonYearMax ?? 2024);
    setHonourPeriodReady(true);
  }, [freshness, honourPeriodReady]);

  useEffect(() => {
    if (!ready) return;
    const next = `#${encode({ filters, grouping, sort, selected: selectedKey, section })}`;
    if (next !== window.location.hash) window.history.replaceState(null, '', next);
  }, [ready, filters, grouping, sort, selectedKey, section]);

  useEffect(() => {
    if (!ready) return;
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [ready, section]);

  const patchFilters = useCallback((patch: Partial<F>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setQuickView(null);
    setSelectedKey(null);
  }, []);

  const resetFilters = useCallback(() => {
    if (!dataset) return;
    setFilters(defaults(dataset.meta.yearMax));
    setQuickView(grouping === 'mercato' ? 'overview' : null);
    setSelectedKey(null);
  }, [dataset, grouping]);

  const resetAll = useCallback(() => {
    if (!dataset) return;
    setSection('market');
    setFilters(defaults(dataset.meta.yearMax));
    setGrouping('mercato');
    setSort({ key: 'volume', dir: -1 });
    setSelectedKey(null);
    setQuickView('overview');
    if (freshness?.honours?.meta.status === 'ready') {
      setHonourFrom(Math.max(2000, freshness.honours.meta.commonYearMin ?? 2000));
      setHonourTo(freshness.honours.meta.commonYearMax ?? 2024);
    }
  }, [dataset, freshness]);

  const applyQuickView = useCallback((view: Exclude<QuickView, null>) => {
    if (!dataset) return;
    const base = defaults(dataset.meta.yearMax);
    setQuickView(view);
    setSelectedKey(null);
    if (view === 'overview') {
      setFilters(base);
      setGrouping('mercato');
      setSort({ key: 'volume', dir: -1 });
    } else if (view === 'spend-decade') {
      setFilters({ ...base, yearFrom: Math.floor(dataset.meta.yearMax / 10) * 10 });
      setGrouping('club');
      setSort({ key: 'spend', dir: -1 });
    } else if (view === 'profit') {
      setFilters({ ...base, balance: 'positive' });
      setGrouping('club');
      setSort({ key: 'balance', dir: -1 });
    } else {
      setFilters(base);
      setGrouping('club');
      setSort({ key: 'income', dir: -1 });
    }
  }, [dataset]);

  const onGrouping = useCallback((next: Grouping) => {
    setGrouping(next);
    setQuickView(null);
    setSelectedKey(null);
    setSort((current) => next === 'mercato' && current.key === 'count' ? { key: 'volume', dir: -1 } : current);
  }, []);

  const onSort = useCallback((key: SortKey) => {
    setQuickView(null);
    setSort((current) => current.key === key
      ? { key, dir: (current.dir * -1) as 1 | -1 }
      : { key, dir: key === 'label' || key === 'sublabel' ? 1 : -1 });
  }, []);

  const refreshFreshness = useCallback(async () => {
    setRefreshing(true);
    try { setFreshness(await loadFreshness(true)); } finally { setRefreshing(false); }
  }, []);

  const rows = useMemo(() => dataset ? filterMercatos(dataset.mercatos, filters) : [], [dataset, filters]);
  const summary = useMemo(() => totals(rows, filters.includeLoanFees), [rows, filters.includeLoanFees]);
  const points = useMemo(() => bySeason(rows, filters.includeLoanFees, 'annual'), [rows, filters.includeLoanFees]);
  const marketGroups = useMemo(() => {
    const grouped = grouping === 'mercato'
      ? groupAnnualMercatos(rows, filters.includeLoanFees)
      : group(rows, grouping, filters.includeLoanFees);
    return sortGroups(grouped, sort.key, sort.dir);
  }, [rows, grouping, filters.includeLoanFees, sort]);
  const selectedMercatos = useMemo(
    () => marketGroups.find((item) => item.key === selectedKey)?.mercatos ?? null,
    [marketGroups, selectedKey],
  );

  const honourGroups = useMemo(() => {
    if (!dataset || freshness?.honours?.meta.status !== 'ready') return [];
    const honourRows = dataset.mercatos.filter((item) => item.year >= honourFrom && item.year <= honourTo);
    const clubs = group(honourRows, 'club', false);
    const titles = new Map<number, {
      breakdown: NonNullable<Group['titleBreakdown']>;
      points: number;
      pointBreakdown: TitlePointBreakdown;
    }>();
    for (const title of freshness.honours.titles) {
      const clubId = title.winner.clubId;
      if (clubId == null || title.season < honourFrom || title.season > honourTo) continue;
      const current = titles.get(clubId) ?? {
        breakdown: {
          league: 0,
          domesticCup: 0,
          leagueCup: 0,
          championsLeague: 0,
          europaLeague: 0,
          conferenceLeague: 0,
          domesticSupercup: 0,
          uefaSupercup: 0,
          world: 0,
        },
        points: 0,
        pointBreakdown: { league: 0, domestic: 0, continental: 0 },
      };
      const points = titleWeight(title);
      current.breakdown[title.category] += 1;
      current.points += points;
      current.pointBreakdown[trophyFamily(title.category)] += points;
      titles.set(clubId, current);
    }
    for (const club of clubs) {
      const record = titles.get(Number(club.key));
      club.titleBreakdown = record?.breakdown ?? {
        league: 0,
        domesticCup: 0,
        leagueCup: 0,
        championsLeague: 0,
        europaLeague: 0,
        conferenceLeague: 0,
        domesticSupercup: 0,
        uefaSupercup: 0,
        world: 0,
      };
      club.titles = Object.values(club.titleBreakdown).reduce((sum, value) => sum + value, 0);
      club.titlePoints = record?.points ?? 0;
      club.titlePointBreakdown = record?.pointBreakdown ?? { league: 0, domestic: 0, continental: 0 };
    }
    return clubs;
  }, [dataset, freshness, honourFrom, honourTo]);

  const coverageGroups = useMemo(
    () => dataset ? group(dataset.mercatos, 'league', false) : [],
    [dataset],
  );

  if (error) {
    return <div className="center-state"><div className="error-box"><strong>Les données n’ont pas pu être chargées.</strong><p>{error}</p><code>npm run data</code></div></div>;
  }
  if (!dataset) return <div className="center-state"><BrandMark /><span>Chargement des mercatos…</span></div>;

  const { meta } = dataset;
  const sourceDate = meta.sourceUpdatedAt
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${meta.sourceUpdatedAt}T12:00:00Z`))
    : 'date inconnue';
  const currentGrouping = GROUPINGS.find((item) => item.value === grouping)!;
  const quickViewLabel = quickView === 'overview' ? 'Vue globale'
    : quickView === 'spend-decade' ? 'Plus gros acheteurs'
      : quickView === 'profit' ? 'Plus gros bénéfices'
        : quickView === 'income' ? 'Meilleures ventes'
          : 'Vue personnalisée';
  const honourMin = Math.max(2000, freshness?.honours?.meta.commonYearMin ?? 2000);
  const honourMax = freshness?.honours?.meta.commonYearMax ?? 2024;

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <div className="page-grid" aria-hidden="true" />
      <header className="app-header">
        <button className="brand-button" onClick={resetAll} title="Réinitialiser et revenir au marché" aria-label="Footato — réinitialiser toute la vue">
          <BrandMark />
          <span><b>Footato</b><small>Le marché, en chiffres</small></span>
        </button>

        <nav className="primary-nav" aria-label="Sections principales">
          {SECTIONS.map((item) => (
            <button key={item.value} aria-current={section === item.value ? 'page' : undefined} onClick={() => { setSection(item.value); setSelectedKey(null); }}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          <button className="data-pill" onClick={() => setSection('coverage')} title="Voir la qualité et les sources" aria-label="Voir la complétude et les sources">
            <i aria-hidden="true" /><span>Données · {sourceDate}</span>
          </button>
        </div>
      </header>

      <main id="main-content">
        {section === 'market' && (
          <section className="content-section market-section" aria-labelledby="market-heading">
            <div className="section-title market-title">
              <div className="market-title-copy">
                <span className="eyebrow-label"><i aria-hidden="true" /> Observatoire des transferts</span>
                <h1 id="market-heading">Lire le<br /><em>marché.</em></h1>
                <p>Achats, ventes et équilibre financier des clubs européens — sans estimer les montants non publiés.</p>
              </div>
              <aside className="market-brief" aria-label="Périmètre actif">
                <span className="brief-kicker">Périmètre actif</span>
                <strong>{season(filters.yearFrom)} <i>→</i> {season(filters.yearTo)}</strong>
                <p>{quickViewLabel}</p>
                <dl>
                  <div><dt>Base</dt><dd>{meta.movementCount.toLocaleString('fr-FR')} mouvements</dd></div>
                  <div><dt>Couverture</dt><dd>{dataset.leagues.length} championnats</dd></div>
                </dl>
              </aside>
            </div>

            <div className="market-overview">
              <Kpis t={summary} />

              <details className="panel trend-disclosure" open>
                <summary><span><span className="eyebrow-label">Chronologie</span><b>Évolution saison par saison</b><small>Cliquer sur le graphique pour isoler une saison</small></span><span aria-hidden="true">⌄</span></summary>
                <SeasonChart points={points} onSelect={(point) => patchFilters({ yearFrom: point.year, yearTo: point.year })} />
              </details>
            </div>

            <section className="panel results-panel">
              <div className="results-header">
                <div>
                  <span className="eyebrow-label">Classement dynamique</span>
                  <h2>{currentGrouping.label}</h2>
                  <p>{currentGrouping.hint}</p>
                </div>
                <div className="view-control">
                  <span className="control-label">Regrouper par</span>
                  <div className="segmented view-tabs" role="group" aria-label="Regroupement du tableau">
                    {GROUPINGS.map((item) => (
                      <button key={item.value} aria-pressed={grouping === item.value} onClick={() => onGrouping(item.value)}>{item.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="quick-views" aria-label="Raccourcis d’analyse">
                <span><b>Raccourcis</b><small>Ils préremplissent la vue et les filtres</small></span>
                <button aria-pressed={quickView === 'overview'} onClick={() => applyQuickView('overview')}>Vue globale</button>
                <button aria-pressed={quickView === 'spend-decade'} onClick={() => applyQuickView('spend-decade')}>Plus gros acheteurs</button>
                <button aria-pressed={quickView === 'income'} onClick={() => applyQuickView('income')}>Meilleures ventes</button>
                <button aria-pressed={quickView === 'profit'} onClick={() => applyQuickView('profit')}>Plus gros bénéfices</button>
                {quickView === null && <span className="custom-view">Personnalisée</span>}
              </div>

              <Filters dataset={dataset} filters={filters} onChange={patchFilters} onReset={resetFilters} />

              <DataTable
                groups={marketGroups}
                grouping={grouping}
                sort={sort}
                onSort={onSort}
                onSelect={(item) => item.mercatos && setSelectedKey(item.key)}
                selectedKey={selectedKey ?? undefined}
              />
            </section>
          </section>
        )}

        {section === 'honours' && freshness?.honours?.meta.status === 'ready' && (
          <HonoursView
            groups={honourGroups}
            yearMin={honourFrom}
            yearMax={honourTo}
            availableYearMin={honourMin}
            availableYearMax={honourMax}
            onPeriodChange={(from, to) => { setHonourFrom(from); setHonourTo(to); }}
          />
        )}

        {section === 'honours' && freshness?.honours?.meta.status !== 'ready' && (
          <div className="center-state"><span>Le palmarès est en cours de préparation.</span></div>
        )}

        {section === 'coverage' && (
          <CompletenessView groups={coverageGroups} freshness={freshness} sourceDate={sourceDate} refreshing={refreshing} onRefresh={refreshFreshness} />
        )}
      </main>

      <footer className="app-footer">
        <span>{meta.movementCount.toLocaleString('fr-FR')} mouvements · {meta.clubCount} clubs · {dataset.leagues.length} championnats</span>
        <span>Montants publiés par Transfermarkt · les valeurs non divulguées ne sont pas estimées</span>
      </footer>

      {selectedMercatos && (
        <MercatoDetail mercatos={selectedMercatos} dataset={dataset} includeLoanFees={filters.includeLoanFees} onClose={() => setSelectedKey(null)} />
      )}
    </div>
  );
}
