import { useMemo, useState } from 'react';
import type { Group } from '../lib/aggregate';
import { count, money, season } from '../lib/format';
import { Flag } from './Flag';

export type TrophyScope = 'all' | 'league' | 'domesticCup' | 'leagueCup' | 'europe' | 'supercup' | 'world';

const TROPHY_SCOPES: { value: TrophyScope; label: string; shortLabel: string }[] = [
  { value: 'all', label: 'Tous les trophées', shortLabel: 'Tous' },
  { value: 'league', label: 'Championnats', shortLabel: 'Championnats' },
  { value: 'domesticCup', label: 'Coupes nationales', shortLabel: 'Coupes' },
  { value: 'leagueCup', label: 'Coupes de la Ligue', shortLabel: 'Coupes de la Ligue' },
  { value: 'europe', label: 'Compétitions européennes', shortLabel: 'Europe' },
  { value: 'supercup', label: 'Supercoupes', shortLabel: 'Supercoupes' },
  { value: 'world', label: 'Titres mondiaux FIFA', shortLabel: 'Monde' },
];

interface Props {
  groups: Group[];
  yearMin: number;
  yearMax: number;
  availableYearMin: number;
  availableYearMax: number;
  scope: TrophyScope;
  onPeriodChange: (from: number, to: number) => void;
  onScopeChange: (scope: TrophyScope) => void;
}

const categorySummary = (group: Group, scope: TrophyScope) => {
  const breakdown = group.titleBreakdown;
  if (!breakdown) return [];
  const all = [
    { label: 'Championnats', value: breakdown.league },
    { label: 'Coupes', value: breakdown.domesticCup + breakdown.leagueCup },
    { label: 'Europe', value: breakdown.championsLeague + breakdown.europaLeague + breakdown.conferenceLeague },
    { label: 'Supercoupes', value: breakdown.domesticSupercup + breakdown.uefaSupercup },
    { label: 'Monde', value: breakdown.world },
  ];
  if (scope === 'all') return all.filter((item) => item.value > 0);
  if (scope === 'league') return [{ label: 'Championnats', value: breakdown.league }].filter((item) => item.value > 0);
  if (scope === 'domesticCup') return [{ label: 'Coupes nationales', value: breakdown.domesticCup }].filter((item) => item.value > 0);
  if (scope === 'leagueCup') return [{ label: 'Coupes de la Ligue', value: breakdown.leagueCup }].filter((item) => item.value > 0);
  if (scope === 'europe') return [{ label: 'Europe', value: breakdown.championsLeague + breakdown.europaLeague + breakdown.conferenceLeague }].filter((item) => item.value > 0);
  if (scope === 'supercup') return [{ label: 'Supercoupes', value: breakdown.domesticSupercup + breakdown.uefaSupercup }].filter((item) => item.value > 0);
  return [{ label: 'Monde', value: breakdown.world }].filter((item) => item.value > 0);
};

export function HonoursView({
  groups,
  yearMin,
  yearMax,
  availableYearMin,
  availableYearMax,
  scope,
  onPeriodChange,
  onScopeChange,
}: Props) {
  const [metric, setMetric] = useState<'titles' | 'efficiency'>('titles');
  const years = useMemo(() => {
    const result: number[] = [];
    for (let year = availableYearMin; year <= availableYearMax; year += 1) result.push(year);
    return result;
  }, [availableYearMin, availableYearMax]);
  const ranked = useMemo(() => [...groups]
    .filter((group) => (group.titles ?? 0) > 0)
    .sort((a, b) => metric === 'titles'
      ? (b.titles ?? 0) - (a.titles ?? 0) || a.spend - b.spend || a.label.localeCompare(b.label, 'fr')
      : (a.spendPerTitle ?? Number.POSITIVE_INFINITY) - (b.spendPerTitle ?? Number.POSITIVE_INFINITY) || (b.titles ?? 0) - (a.titles ?? 0))
    .slice(0, 100), [groups, metric]);
  const peak = ranked[0]?.titles ?? 1;

  return (
    <section className="content-section">
      <div className="section-title">
        <div>
          <span className="eyebrow-label">Performance sportive</span>
          <h2>Palmarès des clubs</h2>
          <p>Un classement dédié, sans mélanger les trophées aux colonnes financières du marché.</p>
        </div>
      </div>

      <div className="panel honours-panel">
        <div className="honours-controls">
          <div className="field">
            <span className="field-label">Période</span>
            <div className="filter-period">
              <select
                className="select compact-select"
                aria-label="Première saison du palmarès"
                value={yearMin}
                onChange={(event) => onPeriodChange(Number(event.target.value), Math.max(Number(event.target.value), yearMax))}
              >
                {years.map((year) => <option key={year} value={year}>{season(year)}</option>)}
              </select>
              <span>—</span>
              <select
                className="select compact-select"
                aria-label="Dernière saison du palmarès"
                value={yearMax}
                onChange={(event) => onPeriodChange(Math.min(Number(event.target.value), yearMin), Number(event.target.value))}
              >
                {years.map((year) => <option key={year} value={year}>{season(year)}</option>)}
              </select>
            </div>
          </div>

          <div className="field scope-field">
            <label className="field-label" htmlFor="trophy-scope">Compétition</label>
            <select
              id="trophy-scope"
              className="select"
              value={scope}
              onChange={(event) => onScopeChange(event.target.value as TrophyScope)}
            >
              {TROPHY_SCOPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          <div className="field metric-field">
            <span className="field-label">Classer par</span>
            <div className="segmented">
              <button aria-pressed={metric === 'titles'} onClick={() => setMetric('titles')}>Trophées</button>
              <button aria-pressed={metric === 'efficiency'} onClick={() => setMetric('efficiency')}>Dépense / trophée</button>
            </div>
          </div>
        </div>

        <div className="honours-list" role="list" aria-label="Classement des palmarès">
          {ranked.map((group, index) => (
            <article className="honours-row" key={group.key} role="listitem">
              <span className="honours-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="honours-club">
                <span><Flag code={group.flag} /><b>{group.label}</b></span>
                <small>{group.sublabel}</small>
              </div>
              <div className="honours-score">
                <strong>{count(group.titles ?? 0)}</strong>
                <span>trophée{group.titles === 1 ? '' : 's'}</span>
              </div>
              <div className="honours-breakdown">
                <div className="honours-bar" aria-hidden="true"><i style={{ width: `${((group.titles ?? 0) / peak) * 100}%` }} /></div>
                <div className="honours-tags">
                  {categorySummary(group, scope).map((item) => <span key={item.label}><b>{item.value}</b> {item.label}</span>)}
                </div>
              </div>
              <div className="honours-cost">
                <span>Dépense / trophée</span>
                <b className="num">{money(group.spendPerTitle ?? 0)}</b>
              </div>
            </article>
          ))}
        </div>

        <div className="panel-foot-note">
          {ranked.length} clubs titrés · chaque trophée officiel compte pour 1 · montants d’achats documentés
        </div>
      </div>
    </section>
  );
}
