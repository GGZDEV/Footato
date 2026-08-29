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
  mercato: ['Club', 'Saison'],
  club: ['Club', 'Championnat'],
  league: ['Championnat', 'Pays'],
  season: ['Saison', 'Mercato'],
};

interface Props {
  groups: Group[];
  grouping: Grouping;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  onSelect: (group: Group) => void;
  selectedKey?: string;
}

const PAGE = 25;

export function DataTable({ groups, grouping, sort, onSort, onSelect, selectedKey }: Props) {
  const [limit, setLimit] = useState(PAGE);
  const interactive = grouping === 'mercato';

  const columns = useMemo<Column[]>(() => {
    const [labelHead, sublabelHead] = HEADS[grouping];
    const result: Column[] = [
      { key: 'label', label: labelHead, align: 'left' },
      { key: 'sublabel', label: sublabelHead, align: 'left' },
    ];
    result.push(
      { key: 'spend', label: 'Achats' },
      { key: 'income', label: 'Ventes' },
      { key: 'balance', label: 'Bilan' },
      { key: 'volume', label: 'Volume', title: 'Achats + ventes' },
    );
    return result;
  }, [grouping]);

  const maxBalance = useMemo(
    () => groups.slice(0, limit).reduce((value, group) => Math.max(value, Math.abs(group.balance)), 0) || 1,
    [groups, limit],
  );
  const visible = groups.slice(0, limit);

  const exportCsv = () => {
    const monetary = new Set<SortKey>(['spend', 'income', 'balance', 'volume']);
    const cell = (value: string | number) => {
      const text = String(value);
      return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [["rang", ...columns.map((column) => monetary.has(column.key) ? `${column.label} (M€)` : column.label)].map(cell).join(';')];
    groups.forEach((group, index) => {
      const values = columns.map((column) => {
        const value = group[column.key];
        return typeof value === 'number' && monetary.has(column.key)
          ? (value / 1000).toFixed(3).replace('.', ',')
          : String(value);
      });
      lines.push([index + 1, ...values].map(cell).join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `footato-${grouping}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (groups.length === 0) return <div className="empty">Aucun résultat pour cette sélection.</div>;

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="left rank-head" scope="col">#</th>
              {columns.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.align === 'left' ? 'left' : undefined}
                    aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    <button onClick={() => onSort(column.key)} title={column.title ?? `Trier par ${column.label.toLowerCase()}`}>
                      {column.label}<span className="arrow">{active ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((group, index) => (
              <tr
                key={group.key}
                className={`${interactive ? 'clickable' : ''}${selectedKey === group.key ? ' active' : ''}`}
                onClick={() => interactive && onSelect(group)}
                tabIndex={interactive ? 0 : undefined}
                onKeyDown={(event) => {
                  if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onSelect(group);
                  }
                }}
              >
                <td className="left rank">{index + 1}</td>
                <td className="left">
                  <span className="cell-name"><Flag code={group.flag} /><b>{group.label}</b></span>
                </td>
                <td className="left cell-sub">
                  {group.sublabel}
                </td>
                <td className="num neg">{money(group.spend)}</td>
                <td className="num pos">{money(group.income)}</td>
                <td className="num bar-cell">
                  <span
                    className="bar"
                    style={{
                      right: 8,
                      width: `${(Math.abs(group.balance) / maxBalance) * 72}%`,
                      background: group.balance >= 0 ? 'var(--in)' : 'var(--out)',
                    }}
                  />
                  <span className={`v ${group.balance >= 0 ? 'pos' : 'neg'}`}>{money(group.balance, { sign: true })}</span>
                </td>
                <td className="num muted">{money(group.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-results">
        {visible.map((group, index) => (
          <button
            className={`result-card${selectedKey === group.key ? ' active' : ''}`}
            key={group.key}
            onClick={() => onSelect(group)}
            disabled={!interactive}
          >
            <span className="result-rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="result-identity">
              <span className="result-name"><Flag code={group.flag} /><b>{group.label}</b></span>
              <span>{group.sublabel}</span>
            </span>
            <span className="result-money">
              <span><small>Achats</small><b className="num neg">{money(group.spend)}</b></span>
              <span><small>Ventes</small><b className="num pos">{money(group.income)}</b></span>
              <span><small>Bilan</small><b className={`num ${group.balance >= 0 ? 'pos' : 'neg'}`}>{money(group.balance, { sign: true })}</b></span>
            </span>
            <span className="result-meta">
              <span>{count(group.arrivals)} arrivées · {count(group.departures)} départs</span>
              <span>{interactive ? 'Voir le détail →' : `Volume ${money(group.volume)}`}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="table-foot">
        <span>{count(Math.min(limit, groups.length))} sur {count(groups.length)}</span>
        {limit < groups.length && <button className="btn" onClick={() => setLimit((value) => value + PAGE * 4)}>Afficher plus</button>}
        <div className="spacer" />
        {interactive && <span className="desktop-hint">Une ligne = été + hiver · cliquez pour séparer les deux mercatos</span>}
        <button className="btn" onClick={exportCsv}>CSV</button>
      </div>
    </>
  );
}
