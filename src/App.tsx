import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from './components/DataTable';
import { BrandMark } from './components/BrandMark';
import { Filters } from './components/Filters';
import { Kpis } from './components/Kpis';
import { MercatoDetail } from './components/MercatoDetail';
import { SeasonChart } from './components/SeasonChart';
import {
  bySeason, filterMercatos, group, sortGroups, totals,
  type Filters as F, type Grouping, type SortKey,
} from './lib/aggregate';
import { loadDataset } from './lib/data';
import { season } from './lib/format';
import type { Dataset } from './lib/types';

const TABS: { value: Grouping; label: string; hint: string }[] = [
  { value: 'mercato', label: 'Mercatos', hint: 'Une ligne par club et par fenêtre de transfert' },
  { value: 'club', label: 'Clubs', hint: 'Cumul sur toute la période filtrée' },
  { value: 'league', label: 'Championnats', hint: 'Cumul par championnat' },
  { value: 'season', label: 'Saisons', hint: 'Cumul par fenêtre de transfert' },
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
    const [sk, sd] = (p.get('s') ?? 'volume:-1').split(':');
    return {
      filters: f,
      grouping: g && TABS.some((t) => t.value === g) ? g : 'mercato',
      sort: { key: (sk || 'volume') as SortKey, dir: sd === '1' ? 1 : -1 },
      selected: p.get('m'),
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<F>(defaults(2026));
  const [grouping, setGrouping] = useState<Grouping>('mercato');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'volume', dir: -1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadDataset()
      .then((d) => {
        const restored = decode(window.location.hash, d.meta.yearMax);
        setDataset(d);
        if (restored) {
          setFilters(restored.filters);
          setGrouping(restored.grouping);
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
    const next = `#${encode({ filters, grouping, sort, selected: selectedKey })}`;
    if (next !== window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }, [ready, filters, grouping, sort, selectedKey]);

  const patch = useCallback((p: Partial<F>) => setFilters((f) => ({ ...f, ...p })), []);
  const reset = useCallback(() => {
    if (dataset) setFilters(defaults(dataset.meta.yearMax));
  }, [dataset]);

  const rows = useMemo(
    () => (dataset ? filterMercatos(dataset.mercatos, filters) : []),
    [dataset, filters],
  );
  const t = useMemo(() => totals(rows, filters.includeLoanFees), [rows, filters.includeLoanFees]);
  const points = useMemo(() => bySeason(rows, filters.includeLoanFees), [rows, filters.includeLoanFees]);
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
          <div className="freshness" title={`Dernière modification de la source : ${meta.sourceUpdatedAt ?? 'inconnue'}`}>
            <i aria-hidden="true" />
            <span><span className="freshness-label">Données vérifiées · </span>{sourceDate}</span>
          </div>
        </div>

        <div className="hero-content">
          <div className="hero-copy">
            <p className="hero-kicker">Observatoire des transferts européens</p>
            <h2>Le mercato,<br /><em>chiffres à l’appui.</em></h2>
            <p>
              Explorez plus de trente ans d’achats et de ventes. Comparez les clubs,
              les championnats et chaque fenêtre de transfert.
            </p>
          </div>
          <div className="hero-metrics" aria-label="Périmètre des données">
            <div><strong>{meta.movementCount.toLocaleString('fr-FR')}</strong><span>mouvements</span></div>
            <div><strong>{meta.clubCount}</strong><span>clubs</span></div>
            <div><strong>{dataset.leagues.length}</strong><span>championnats</span></div>
            <div><strong>{season(meta.yearMin)} — {season(meta.yearMax)}</strong><span>couverture</span></div>
          </div>
        </div>
      </header>

      <Filters dataset={dataset} filters={filters} onChange={patch} onReset={reset} />

      <Kpis t={t} />

      <section className="panel">
        <div className="panel-head">
          <h2>Achats et ventes, mercato par mercato</h2>
          <p>Cliquez une fenêtre pour n’afficher qu’elle</p>
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
        )}
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
