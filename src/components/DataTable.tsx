import { useMemo, useState } from 'react';
import type { Group, Grouping, SortKey } from '../lib/aggregate';
import { count, money } from '../lib/format';
import { Flag } from './Flag';

interface Column {
  key: SortKey;
  label: string;
  align?: 'left';
  title?: string;
}

const HEADS: Record<Grouping, [string, string]> = {
  mercato: ['Club', 'Mercato'],
  club: ['Club', 'Championnat'],
  league: ['Championnat', 'Pays'],
  season: ['Saison', 'Fenêtre'],
};

interface Props {
  groups: Group[];
  grouping: Grouping;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  onSelect: (g: Group) => void;
  selectedKey?: string;
  showHonours?: boolean;
  trophyScope?: string;
  trophyScopeLabel?: string;
}

const TROPHY_BADGES = [
  { key: 'league', label: 'CH', title: 'Championnats' },
  { key: 'domesticCup', label: 'CN', title: 'Coupes nationales' },
  { key: 'leagueCup', label: 'CL', title: 'Coupes de la Ligue' },
  { key: 'championsLeague', label: 'LDC', title: 'Ligues des champions' },
  { key: 'europaLeague', label: 'UEL', title: 'Coupes UEFA / Europa League' },
  { key: 'conferenceLeague', label: 'UECL', title: 'Conference League' },
  { key: 'domesticSupercup', label: 'SCN', title: 'Supercoupes nationales' },
  { key: 'uefaSupercup', label: 'SCU', title: 'Supercoupes UEFA' },
  { key: 'world', label: 'MON', title: 'Titres mondiaux FIFA' },
] as const;

const trophyDetails = (g: Group) => TROPHY_BADGES
  .map((badge) => `${badge.title} : ${g.titleBreakdown?.[badge.key] ?? 0}`)
  .join(' · ');

function TrophyBadges({ group }: { group: Group }) {
  return (
    <span className="trophy-badges" aria-label={trophyDetails(group)}>
      {TROPHY_BADGES.map((badge) => {
        const value = group.titleBreakdown?.[badge.key] ?? 0;
        return value > 0 ? <span key={badge.key} title={`${badge.title} : ${value}`}><i>{badge.label}</i>{value}</span> : null;
      })}
    </span>
  );
}

const PAGE = 100;

export function DataTable({ groups, grouping, sort, onSort, onSelect, selectedKey, showHonours = false, trophyScope = 'all', trophyScopeLabel = 'Tous' }: Props) {
  const [limit, setLimit] = useState(PAGE);

  const columns = useMemo<Column[]>(() => {
    const [labelHead, subHead] = HEADS[grouping];
    const cols: Column[] = [
      { key: 'label', label: labelHead, align: 'left' },
      { key: 'sublabel', label: subHead, align: 'left' },
    ];
    if (grouping !== 'mercato') cols.push({ key: 'count', label: 'Mercatos' });
    if (grouping === 'club' && showHonours) cols.push(
      { key: 'titles', label: trophyScope === 'all' ? 'Trophées' : `Trophées · ${trophyScopeLabel}`, title: 'Trophées officiels remportés sur la période et dans la famille sélectionnée' },
      { key: 'spendPerTitle', label: 'Coût / trophée', title: 'Achats documentés divisés par le nombre de trophées sélectionnés' },
    );
    cols.push(
      { key: 'arrivals', label: 'Arr.', title: 'Nombre d’arrivées' },
      { key: 'spend', label: 'Achats' },
      { key: 'departures', label: 'Dép.', title: 'Nombre de départs' },
      { key: 'income', label: 'Ventes' },
      { key: 'balance', label: 'Bilan' },
      { key: 'volume', label: 'Volume', title: 'Achats + ventes' },
      { key: 'coverage', label: 'Complétude', title: 'Indemnités publiques ÷ (publiques + explicitement indisponibles)' },
    );
    return cols;
  }, [grouping, showHonours, trophyScope, trophyScopeLabel]);

  const maxBalance = useMemo(
    () => groups.slice(0, limit).reduce((n, g) => Math.max(n, Math.abs(g.balance)), 0) || 1,
    [groups, limit],
  );

  const visible = groups.slice(0, limit);

  const exportCsv = () => {
    const monetary = new Set<SortKey>(['spend', 'income', 'balance', 'volume', 'spendPerTitle']);
    const percentage = new Set<SortKey>(['coverage']);
    const csvCell = (value: string | number) => {
      const text = String(value);
      return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const trophyHeads = grouping === 'club' && showHonours ? TROPHY_BADGES.map((badge) => badge.title) : [];
    const head = ['rang', ...columns.map((c) => monetary.has(c.key) ? `${c.label} (M€)` : percentage.has(c.key) ? `${c.label} (%)` : c.label), ...trophyHeads];
    const lines = [head.map(csvCell).join(';')];
    groups.forEach((g, i) => {
      const cells = columns.map((c) => {
        const v = g[c.key];
        if (typeof v === 'number' && monetary.has(c.key)) return (v / 1000).toFixed(3).replace('.', ',');
        if (typeof v === 'number' && percentage.has(c.key)) return (v * 100).toFixed(1).replace('.', ',');
        return String(v);
      });
      const trophyCells = grouping === 'club' && showHonours
        ? TROPHY_BADGES.map((badge) => g.titleBreakdown?.[badge.key] ?? 0)
        : [];
      lines.push([i + 1, ...cells, ...trophyCells].map(csvCell).join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `footato-${grouping}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (groups.length === 0) {
    return <div className="empty">Aucun mercato ne correspond à ces filtres.</div>;
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="left" scope="col"><button style={{ cursor: 'default' }} tabIndex={-1}>#</button></th>
              {columns.map((c) => {
                const isSorted = sort.key === c.key;
                return (
                  <th
                    key={c.key} scope="col" className={c.align === 'left' ? 'left' : undefined}
                    aria-sort={isSorted ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    <button onClick={() => onSort(c.key)} title={c.title ?? `Trier par ${c.label.toLowerCase()}`}>
                      {c.label}
                      <span className="arrow">{isSorted ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((g, i) => (
              <tr
                key={g.key}
                className={`clickable${selectedKey === g.key ? ' active' : ''}`}
                onClick={() => onSelect(g)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(g); } }}
              >
                <td className="left rank">{i + 1}</td>
                <td className="left">
                  <span className="cell-name">
                    <Flag code={g.flag} />
                    <b>{g.label}</b>
                  </span>
                </td>
                <td className="left cell-sub">{g.sublabel}</td>
                {grouping !== 'mercato' && <td className="num">{count(g.count)}</td>}
                {grouping === 'club' && showHonours && <>
                  <td className="num honours-cell" title={`${count(g.titles ?? 0)} dans la sélection · ${trophyDetails(g)}`}>
                    <span className="trophy-total">{count(g.titles ?? 0)}</span>
                    <TrophyBadges group={g} />
                  </td>
                  <td className="num muted">{g.titles ? money(g.spendPerTitle ?? 0) : '—'}</td>
                </>}
                <td className="num muted">{count(g.arrivals)}</td>
                <td className="num neg">{money(g.spend)}</td>
                <td className="num muted">{count(g.departures)}</td>
                <td className="num pos">{money(g.income)}</td>
                <td className="num bar-cell">
                  <span
                    className="bar"
                    style={{
                      right: 6,
                      width: `${(Math.abs(g.balance) / maxBalance) * 78}%`,
                      background: g.balance >= 0 ? 'var(--in)' : 'var(--out)',
                    }}
                  />
                  <span className={`v ${g.balance >= 0 ? 'pos' : 'neg'}`}>{money(g.balance, { sign: true })}</span>
                </td>
                <td className="num muted">{money(g.volume)}</td>
                <td className="num">
                  <span className={`coverage-badge ${g.coverage >= .8 ? 'high' : g.coverage >= .6 ? 'medium' : 'low'}`}>
                    {Math.round(g.coverage * 100)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-results">
        {visible.map((g, i) => (
          <button
            className={`result-card${selectedKey === g.key ? ' active' : ''}`}
            key={g.key}
            onClick={() => onSelect(g)}
            disabled={!g.mercato}
          >
            <span className="result-rank">#{i + 1}</span>
            <span className="result-identity">
              <span className="result-name"><Flag code={g.flag} /><b>{g.label}</b></span>
              <span>{g.sublabel}{grouping !== 'mercato' ? ` · ${count(g.count)} mercatos` : ''}</span>
              {grouping === 'club' && showHonours && (
                <span className="mobile-trophies">
                  <b>{count(g.titles ?? 0)} trophée{g.titles === 1 ? '' : 's'} {trophyScope === 'all' ? '' : `· ${trophyScopeLabel}`}</b>
                  <TrophyBadges group={g} />
                  {g.titles ? <small>{money(g.spendPerTitle ?? 0)} / trophée</small> : null}
                </span>
              )}
            </span>
            <span className="result-money">
              <span><small>Achats</small><b className="num neg">{money(g.spend)}</b></span>
              <span><small>Ventes</small><b className="num pos">{money(g.income)}</b></span>
              <span><small>Bilan</small><b className={`num ${g.balance >= 0 ? 'pos' : 'neg'}`}>{money(g.balance, { sign: true })}</b></span>
            </span>
            <span className="result-meta">
              <span>{count(g.arrivals)} arrivées · {count(g.departures)} départs</span>
              <span>Volume {money(g.volume)} · Complétude {Math.round(g.coverage * 100)}%</span>
            </span>
          </button>
        ))}
      </div>

      <div className="table-foot">
        <span>
          {count(Math.min(limit, groups.length))} sur {count(groups.length)} ligne{groups.length > 1 ? 's' : ''}
        </span>
        {limit < groups.length && (
          <button className="btn" onClick={() => setLimit((l) => l + PAGE * 4)}>Afficher plus</button>
        )}
        <div className="spacer" />
        {grouping === 'mercato' && <span className="desktop-hint">Cliquez sur une ligne pour ouvrir le détail du mercato</span>}
        <button className="btn" onClick={exportCsv}>Exporter en CSV</button>
      </div>
    </>
  );
}
