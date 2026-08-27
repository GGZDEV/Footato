import { useMemo, useState, type CSSProperties } from 'react';
import type { Group } from '../lib/aggregate';
import { count, money, season } from '../lib/format';
import { WEIGHT_LEGEND } from '../lib/honours';
import { Flag } from './Flag';

type FinancialBasis = 'spend' | 'net' | 'income';
type RankingMetric = 'efficiency' | 'score' | 'amount';

const FINANCIAL_BASES: { value: FinancialBasis; label: string; shortLabel: string; hint: string }[] = [
  { value: 'spend', label: 'Achats', shortLabel: 'Achats', hint: 'Total des indemnités d’achat documentées.' },
  { value: 'net', label: 'Investissement net', shortLabel: 'Net', hint: 'Achats moins ventes ; un club excédentaire est considéré comme autofinancé.' },
  { value: 'income', label: 'Ventes', shortLabel: 'Ventes', hint: 'Total des indemnités de vente documentées.' },
];

interface Props {
  groups: Group[];
  yearMin: number;
  yearMax: number;
  availableYearMin: number;
  availableYearMax: number;
  onPeriodChange: (from: number, to: number) => void;
}

interface RankedGroup {
  group: Group;
  amount: number;
  ratio: number;
}

const scoreFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

const financialAmount = (group: Group, basis: FinancialBasis) => {
  if (basis === 'income') return group.income;
  if (basis === 'net') return Math.max(0, group.spend - group.income);
  return group.spend;
};

const detailLine = (group: Group, family: 'league' | 'domestic' | 'continental') => {
  const breakdown = group.titleBreakdown!;
  if (family === 'league') return breakdown.league ? `${scoreFormat.format(group.titlePointBreakdown?.league ?? 0)} pts d’indice` : 'Aucun titre';
  if (family === 'domestic') {
    const cups = breakdown.domesticCup + breakdown.leagueCup;
    const supercups = breakdown.domesticSupercup;
    return [cups ? `${cups} coupe${cups > 1 ? 's' : ''}` : '', supercups ? `${supercups} supercoupe${supercups > 1 ? 's' : ''}` : '']
      .filter(Boolean).join(' · ') || 'Aucun titre';
  }
  const europe = breakdown.championsLeague + breakdown.europaLeague + breakdown.conferenceLeague;
  const extras = breakdown.uefaSupercup + breakdown.world;
  return [europe ? `${europe} coupe${europe > 1 ? 's' : ''} d’Europe` : '', extras ? `${extras} autre${extras > 1 ? 's' : ''}` : '']
    .filter(Boolean).join(' · ') || 'Aucun titre';
};

function TitleCell({ group, family }: { group: Group; family: 'league' | 'domestic' | 'continental' }) {
  const breakdown = group.titleBreakdown!;
  const value = family === 'league'
    ? breakdown.league
    : family === 'domestic'
      ? breakdown.domesticCup + breakdown.leagueCup + breakdown.domesticSupercup
      : breakdown.championsLeague + breakdown.europaLeague + breakdown.conferenceLeague + breakdown.uefaSupercup + breakdown.world;
  const points = group.titlePointBreakdown?.[family] ?? 0;
  const label = family === 'league' ? 'Championnat' : family === 'domestic' ? 'National' : 'Continental';
  const icon = family === 'league' ? '●' : family === 'domestic' ? '◆' : '✦';

  return (
    <div className={`honours-title-cell ${family}${value ? '' : ' empty-title'}`}>
      <span className="honours-title-icon" aria-hidden="true">{icon}</span>
      <div>
        <span>{label}</span>
        <strong className="num">{value}</strong>
        <small>{detailLine(group, family)}</small>
      </div>
      <i style={{ '--title-strength': Math.min(100, points * 8) } as CSSProperties} aria-hidden="true" />
    </div>
  );
}

export function HonoursView({
  groups,
  yearMin,
  yearMax,
  availableYearMin,
  availableYearMax,
  onPeriodChange,
}: Props) {
  const [basis, setBasis] = useState<FinancialBasis>('spend');
  const [ranking, setRanking] = useState<RankingMetric>('efficiency');
  const [query, setQuery] = useState('');
  const years = useMemo(() => {
    const result: number[] = [];
    for (let year = availableYearMin; year <= availableYearMax; year += 1) result.push(year);
    return result;
  }, [availableYearMin, availableYearMax]);

  const eligible = useMemo<RankedGroup[]>(() => groups
    .filter((group) => (group.titlePoints ?? 0) > 0)
    .map((group) => {
      const amount = financialAmount(group, basis);
      return { group, amount, ratio: amount / (group.titlePoints ?? 1) };
    }), [groups, basis]);

  const ranked = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('fr');
    return eligible
      .filter(({ group }) => !search || `${group.label} ${group.sublabel}`.toLocaleLowerCase('fr').includes(search))
      .sort((a, b) => {
        if (ranking === 'score') return (b.group.titlePoints ?? 0) - (a.group.titlePoints ?? 0) || a.ratio - b.ratio;
        if (ranking === 'amount') return b.amount - a.amount || (b.group.titlePoints ?? 0) - (a.group.titlePoints ?? 0);
        const efficiency = basis === 'income' ? b.ratio - a.ratio : a.ratio - b.ratio;
        return efficiency || (b.group.titlePoints ?? 0) - (a.group.titlePoints ?? 0);
      })
      .slice(0, 100);
  }, [basis, eligible, query, ranking]);

  const totals = useMemo(() => eligible.reduce((summary, item) => ({
    amount: summary.amount + item.amount,
    points: summary.points + (item.group.titlePoints ?? 0),
    titles: summary.titles + (item.group.titles ?? 0),
  }), { amount: 0, points: 0, titles: 0 }), [eligible]);
  const peakScore = Math.max(...ranked.map(({ group }) => group.titlePoints ?? 0), 1);
  const basisLabel = FINANCIAL_BASES.find((item) => item.value === basis)!.label;
  const averageRatio = totals.points ? totals.amount / totals.points : 0;

  return (
    <section className="content-section">
      <div className="section-title honours-page-title">
        <div>
          <span className="eyebrow-label">Investissement × performance</span>
          <h2>Ce que l’argent a vraiment rapporté</h2>
          <p>Les montants de transferts face aux titres remportés, avec un niveau de valeur différent pour chaque compétition.</p>
        </div>
      </div>

      <div className="panel honours-panel">
        <div className="honours-controls">
          <div className="field honours-period-field">
            <span className="field-label">Saisons concernées</span>
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

          <div className="field honours-basis-field">
            <span className="field-label">Comparer les titres aux</span>
            <div className="segmented" role="group" aria-label="Base financière">
              {FINANCIAL_BASES.map((item) => (
                <button key={item.value} title={item.hint} aria-pressed={basis === item.value} onClick={() => setBasis(item.value)}>{item.shortLabel}</button>
              ))}
            </div>
          </div>

          <div className="field honours-search-field">
            <label className="field-label" htmlFor="honours-club-search">Club ou championnat</label>
            <input
              id="honours-club-search"
              className="input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex. Liverpool, Liga…"
            />
          </div>

          <div className="field metric-field">
            <span className="field-label">Classer par</span>
            <div className="segmented" role="group" aria-label="Classement du palmarès">
              <button aria-pressed={ranking === 'efficiency'} onClick={() => setRanking('efficiency')}>Rendement</button>
              <button aria-pressed={ranking === 'score'} onClick={() => setRanking('score')}>Indice</button>
              <button aria-pressed={ranking === 'amount'} onClick={() => setRanking('amount')}>Montant</button>
            </div>
          </div>
        </div>

        <div className="honours-equation" aria-label={`Synthèse : ${basisLabel}, indice sportif et montant par point`}>
          <div>
            <span>{basisLabel} documentés</span>
            <strong className="num">{money(totals.amount, { dash: false })}</strong>
          </div>
          <b aria-hidden="true">÷</b>
          <div>
            <span>Indice sportif</span>
            <strong className="num accent-number">{scoreFormat.format(totals.points)} pts</strong>
            <small>{count(totals.titles)} trophées</small>
          </div>
          <b aria-hidden="true">=</b>
          <div className="equation-result">
            <span>{basisLabel} par point</span>
            <strong className="num">{money(averageRatio, { dash: false })}</strong>
            <small>{basis === 'income' ? 'Plus haut = plus de ventes par point' : 'Plus bas = meilleur rendement'}</small>
          </div>
        </div>

        <div className="honours-table-head" aria-hidden="true">
          <span>#</span><span>Club</span><span>{basisLabel}</span><span />
          <span>Championnat</span><span>Coupes nationales</span><span>Europe & monde</span><span>Indice</span><span>{basisLabel} / point</span>
        </div>

        <div className="honours-list" role="list" aria-label="Classement investissement et palmarès">
          {ranked.map(({ group, amount, ratio }, index) => (
            <article className="honours-row" key={group.key} role="listitem">
              <span className="honours-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="honours-club">
                <span><Flag code={group.flag} /><b>{group.label}</b></span>
                <small>{group.sublabel}</small>
              </div>
              <div className="honours-finance">
                <span>{basisLabel}</span>
                <strong className="num">{money(amount, { dash: false })}</strong>
                {basis === 'net' && amount === 0 && <small>Autofinancé</small>}
              </div>
              <span className="honours-flow" aria-hidden="true">→</span>
              <TitleCell group={group} family="league" />
              <TitleCell group={group} family="domestic" />
              <TitleCell group={group} family="continental" />
              <div className="honours-index">
                <strong className="num">{scoreFormat.format(group.titlePoints ?? 0)}</strong>
                <span>points</span>
                <i aria-hidden="true"><b style={{ width: `${((group.titlePoints ?? 0) / peakScore) * 100}%` }} /></i>
              </div>
              <div className="honours-cost">
                <span>{basisLabel} / point</span>
                <b className="num">{basis === 'net' && amount === 0 ? 'Autofinancé' : money(ratio, { dash: false })}</b>
              </div>
            </article>
          ))}
          {ranked.length === 0 && <div className="empty">Aucun club titré ne correspond à cette recherche.</div>}
        </div>

        <details className="honours-method">
          <summary><span><b>Comment l’indice est calculé</b><small>Une échelle éditoriale, visible et modifiable — pas un coefficient officiel.</small></span><span aria-hidden="true">⌄</span></summary>
          <div className="weight-grid">
            {WEIGHT_LEGEND.map((item) => <span key={item.label}><b className="num">{scoreFormat.format(item.points)}</b><small>{item.label}</small></span>)}
          </div>
        </details>

        <div className="panel-foot-note">
          {ranked.length} clubs affichés · montants documentés uniquement · titres de {season(yearMin)} à {season(yearMax)}
        </div>
      </div>
    </section>
  );
}
