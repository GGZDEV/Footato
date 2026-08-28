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
  { value: 'all', label: 'Année complète' },
  { value: 0, label: 'Été seulement' },
  { value: 1, label: 'Hiver seulement' },
];

const BALANCES: { value: F['balance']; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'negative', label: 'Déficitaires' },
  { value: 'positive', label: 'Excédentaires' },
];

export function Filters({ dataset, filters, onChange, onReset }: Props) {
  const { meta, leagues } = dataset;
  const [query, setQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const blurTimer = useRef<number>();

  const clubIndex = useMemo(() => {
    const map = new Map<number, { id: number; name: string; league: string; year: number }>();
    for (const m of dataset.mercatos) {
      const previous = map.get(m.clubId);
      if (!previous || m.year >= previous.year) {
        map.set(m.clubId, { id: m.clubId, name: m.club, league: m.league.name, year: m.year });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [dataset]);

  const suggestions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return [];
    const chosen = new Set(filters.clubs);
    return clubIndex
      .filter((club) => !chosen.has(club.id) && club.name.toLowerCase().includes(search))
      .slice(0, 24);
  }, [query, clubIndex, filters.clubs]);

  const years = useMemo(() => {
    const result: number[] = [];
    for (let year = meta.yearMin; year <= meta.yearMax; year += 1) result.push(year);
    return result;
  }, [meta.yearMin, meta.yearMax]);

  const advancedCount = filters.leagues.length
    + (filters.window === 'all' ? 0 : 1)
    + (filters.balance === 'all' ? 0 : 1)
    + (filters.minVolume > 0 ? 1 : 0)
    + (filters.includeLoanFees ? 1 : 0);
  const activeCount = advancedCount
    + filters.clubs.length
    + (filters.yearFrom !== 2000 || filters.yearTo !== meta.yearMax ? 1 : 0);

  const toggleLeague = (id: string) => onChange({
    leagues: filters.leagues.includes(id)
      ? filters.leagues.filter((league) => league !== id)
      : [...filters.leagues, id],
  });

  const addClub = (id: number) => {
    onChange({ clubs: [...filters.clubs, id] });
    setQuery('');
    setSuggestionsOpen(false);
  };

  return (
    <div className="filter-builder">
      <div className="filter-bar">
        <span className="control-label">Affiner</span>

        <div className="filter-period" aria-label="Période">
          <select
            className="select compact-select"
            aria-label="Saison de début"
            value={filters.yearFrom}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange({ yearFrom: value, yearTo: Math.max(value, filters.yearTo) });
            }}
          >
            {years.map((year) => <option key={year} value={year}>{season(year)}</option>)}
          </select>
          <span aria-hidden="true">—</span>
          <select
            className="select compact-select"
            aria-label="Saison de fin"
            value={filters.yearTo}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange({ yearTo: value, yearFrom: Math.min(value, filters.yearFrom) });
            }}
          >
            {years.map((year) => <option key={year} value={year}>{season(year)}</option>)}
          </select>
        </div>

        <div className="autocomplete club-filter">
          <input
            className="input"
            type="search"
            autoComplete="off"
            aria-label="Rechercher un club"
            placeholder="Rechercher un club"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSuggestionsOpen(true); }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => { blurTimer.current = window.setTimeout(() => setSuggestionsOpen(false), 120); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && suggestions.length) { event.preventDefault(); addClub(suggestions[0].id); }
              if (event.key === 'Escape') setSuggestionsOpen(false);
            }}
          />
          {suggestionsOpen && suggestions.length > 0 && (
            <ul onMouseDown={() => window.clearTimeout(blurTimer.current)}>
              {suggestions.map((club) => (
                <li key={club.id}>
                  <button onClick={() => addClub(club.id)}>{club.name}<small>{club.league}</small></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          className={`filter-more${advancedOpen ? ' open' : ''}`}
          onClick={() => setAdvancedOpen((value) => !value)}
          aria-expanded={advancedOpen}
        >
          Filtres avancés{advancedCount ? <b>{advancedCount}</b> : null}
          <span aria-hidden="true">⌄</span>
        </button>

        {activeCount > 0 && <button className="filter-reset" onClick={onReset}>Tout effacer</button>}
      </div>

      {filters.clubs.length > 0 && (
        <div className="selected-filters" aria-label="Clubs sélectionnés">
          {filters.clubs.map((id) => (
            <button
              key={id}
              onClick={() => onChange({ clubs: filters.clubs.filter((clubId) => clubId !== id) })}
              title="Retirer ce club"
            >
              {dataset.clubs[id]} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {advancedOpen && (
        <div className="advanced-filters">
          <div className="advanced-grid">
            <div className="field">
              <span className="field-label">Mercato</span>
              <div className="segmented" role="group" aria-label="Mercato : été ou hiver">
                {WINDOWS.map((item) => (
                  <button
                    key={String(item.value)}
                    aria-pressed={filters.window === item.value}
                    onClick={() => onChange({ window: item.value })}
                  >{item.label}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Bilan</span>
              <div className="segmented" role="group" aria-label="Bilan financier">
                {BALANCES.map((item) => (
                  <button
                    key={item.value}
                    aria-pressed={filters.balance === item.value}
                    onClick={() => onChange({ balance: item.value })}
                  >{item.label}</button>
                ))}
              </div>
            </div>

            <div className="field volume-filter">
              <label htmlFor="min-volume" className="field-label">Volume minimum</label>
              <div className="input-suffix">
                <input
                  id="min-volume"
                  className="input"
                  type="number"
                  min={0}
                  step={5}
                  value={filters.minVolume ? filters.minVolume / 1000 : ''}
                  placeholder="0"
                  onChange={(event) => onChange({ minVolume: Math.max(0, Number(event.target.value) || 0) * 1000 })}
                />
                <span>M€</span>
              </div>
            </div>

            <label className="switch loan-switch" title="Ajouter les indemnités de prêt publiées aux montants.">
              <input
                type="checkbox"
                checked={filters.includeLoanFees}
                onChange={(event) => onChange({ includeLoanFees: event.target.checked })}
              />
              <span className="track" />
              Indemnités de prêt
            </label>
          </div>

          <div className="field league-filter">
            <span className="field-label">Championnats</span>
            <div className="league-grid">
              {leagues.map((league) => (
                <button
                  key={league.id}
                  className="league-chip"
                  aria-pressed={filters.leagues.includes(league.id)}
                  onClick={() => toggleLeague(league.id)}
                >
                  <Flag code={league.code} label={league.country} />
                  <span>{league.name}</span>
                  <i aria-hidden="true">✓</i>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
