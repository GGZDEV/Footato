import { useMemo, useRef, useState } from 'react';
import type { Filters as F } from '../lib/aggregate';
import type { Dataset } from '../lib/types';
import { season } from '../lib/format';
import { Flag } from './Flag';

interface Props {
  dataset: Dataset;
  filters: F;
  onChange: (patch: Partial<F>) => void;
  onReset: () => void;
}

const WINDOWS: { value: F['window']; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 0, label: 'Été' },
  { value: 1, label: 'Hiver' },
];

const BALANCES: { value: F['balance']; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'negative', label: 'Déficitaires' },
  { value: 'positive', label: 'Excédentaires' },
];

export function Filters({ dataset, filters, onChange, onReset }: Props) {
  const { meta, leagues } = dataset;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number>();

  /** Club id -> the league it most recently played in, for the autocomplete hint. */
  const clubIndex = useMemo(() => {
    const map = new Map<number, { id: number; name: string; league: string; year: number }>();
    for (const m of dataset.mercatos) {
      const prev = map.get(m.clubId);
      if (!prev || m.year >= prev.year) {
        map.set(m.clubId, { id: m.clubId, name: m.club, league: m.league.name, year: m.year });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [dataset]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(filters.clubs);
    return clubIndex.filter((c) => !chosen.has(c.id) && c.name.toLowerCase().includes(q)).slice(0, 40);
  }, [query, clubIndex, filters.clubs]);

  const years: number[] = [];
  for (let y = meta.yearMin; y <= meta.yearMax; y++) years.push(y);

  const toggleLeague = (id: string) => {
    const next = filters.leagues.includes(id)
      ? filters.leagues.filter((l) => l !== id)
      : [...filters.leagues, id];
    onChange({ leagues: next });
  };

  const addClub = (id: number) => {
    onChange({ clubs: [...filters.clubs, id] });
    setQuery('');
    setOpen(false);
  };

  const activeCount =
    filters.leagues.length + filters.clubs.length +
    (filters.window === 'all' ? 0 : 1) + (filters.balance === 'all' ? 0 : 1) +
    (filters.minVolume > 0 ? 1 : 0) +
    (filters.yearFrom !== 2000 || filters.yearTo !== meta.yearMax ? 1 : 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Filtres</h2>
        {activeCount > 0 && <p>{activeCount} filtre{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}</p>}
        <div className="spacer" style={{ flex: 1 }} />
        <label className="switch" title="Transfermarkt facture séparément les indemnités de prêt : à vous de dire si elles comptent.">
          <input
            type="checkbox"
            checked={filters.includeLoanFees}
            onChange={(e) => onChange({ includeLoanFees: e.target.checked })}
          />
          <span className="track" />
          Inclure les indemnités de prêt
        </label>
        {activeCount > 0 && <button className="link-btn" onClick={onReset}>Réinitialiser</button>}
      </div>

      <div className="filters">
        <div className="filter-row">
          <div className="field">
            <span className="field-label">Saisons</span>
            <div className="range">
              <select
                className="select" aria-label="Saison de début" value={filters.yearFrom}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange({ yearFrom: v, yearTo: Math.max(v, filters.yearTo) });
                }}
              >
                {years.map((y) => <option key={y} value={y}>{season(y)}</option>)}
              </select>
              <span>→</span>
              <select
                className="select" aria-label="Saison de fin" value={filters.yearTo}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange({ yearTo: v, yearFrom: Math.min(v, filters.yearFrom) });
                }}
              >
                {years.map((y) => <option key={y} value={y}>{season(y)}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Fenêtre</span>
            <div className="segmented" role="group" aria-label="Fenêtre de transfert">
              {WINDOWS.map((w) => (
                <button
                  key={String(w.value)} aria-pressed={filters.window === w.value}
                  onClick={() => onChange({ window: w.value })}
                >{w.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Bilan</span>
            <div className="segmented" role="group" aria-label="Bilan">
              {BALANCES.map((b) => (
                <button
                  key={b.value} aria-pressed={filters.balance === b.value}
                  onClick={() => onChange({ balance: b.value })}
                >{b.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="minvol" className="field-label">Volume min. (M€)</label>
            <input
              id="minvol" className="input" type="number" min={0} step={5} style={{ width: 100 }}
              value={filters.minVolume ? filters.minVolume / 1000 : ''}
              placeholder="0"
              onChange={(e) => onChange({ minVolume: Math.max(0, Number(e.target.value) || 0) * 1000 })}
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="field" style={{ flex: 1, minWidth: 280 }}>
            <span className="field-label">Championnats</span>
            <div className="chips">
              {leagues.map((l) => (
                <button
                  key={l.id} className="chip" aria-pressed={filters.leagues.includes(l.id)}
                  onClick={() => toggleLeague(l.id)}
                  title={`${l.name} — ${l.country}`}
                >
                  <Flag code={l.code} label={l.country} />{l.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="filter-row">
          <div className="field autocomplete" style={{ minWidth: 260 }}>
            <label htmlFor="club-search" className="field-label">Club</label>
            <input
              id="club-search" className="input" type="search" autoComplete="off"
              placeholder="Rechercher un club…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suggestions.length) { e.preventDefault(); addClub(suggestions[0].id); }
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            {open && suggestions.length > 0 && (
              <ul onMouseDown={() => window.clearTimeout(blurTimer.current)}>
                {suggestions.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => addClub(c.id)}>
                      {c.name}<small>{c.league}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {filters.clubs.length > 0 && (
            <div className="field" style={{ flex: 1 }}>
              <span className="field-label">Clubs sélectionnés</span>
              <div className="chips">
                {filters.clubs.map((id) => (
                  <button
                    key={id} className="chip removable"
                    onClick={() => onChange({ clubs: filters.clubs.filter((c) => c !== id) })}
                    title="Retirer ce club"
                  >
                    <b>{dataset.clubs[id]}</b><span className="x">×</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
