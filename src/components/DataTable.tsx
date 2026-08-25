import { useMemo, useState } from 'react';
import type { Group, Grouping, SortKey } from '../lib/aggregate';
import { count, money } from '../lib/format';

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
}

const PAGE = 100;

export function DataTable({ groups, grouping, sort, onSort, onSelect, selectedKey }: Props) {
  const [limit, setLimit] = useState(PAGE);

  const columns = useMemo<Column[]>(() => {
    const [labelHead, subHead] = HEADS[grouping];
    const cols: Column[] = [
      { key: 'label', label: labelHead, align: 'left' },
      { key: 'sublabel', label: subHead, align: 'left' },
    ];
    if (grouping !== 'mercato') cols.push({ key: 'count', label: 'Mercatos' });
    cols.push(
      { key: 'arrivals', label: 'Arr.', title: 'Nombre d’arrivées' },
      { key: 'spend', label: 'Achats' },
      { key: 'departures', label: 'Dép.', title: 'Nombre de départs' },
      { key: 'income', label: 'Ventes' },
      { key: 'balance', label: 'Bilan' },
      { key: 'volume', label: 'Volume', title: 'Achats + ventes' },
    );
    return cols;
  }, [grouping]);

  const maxBalance = useMemo(
    () => groups.slice(0, limit).reduce((n, g) => Math.max(n, Math.abs(g.balance)), 0) || 1,
    [groups, limit],
  );

  const visible = groups.slice(0, limit);

  const exportCsv = () => {
    const head = ['rang', ...columns.map((c) => c.label)];
    const lines = [head.join(';')];
    groups.forEach((g, i) => {
      const cells = columns.map((c) => {
        const v = g[c.key];
        return typeof v === 'number' && c.key !== 'count' && c.key !== 'arrivals' && c.key !== 'departures'
          ? (v / 1000).toFixed(3).replace('.', ',')
          : String(v);
      });
      lines.push([i + 1, ...cells].join(';'));
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
                    <span className="flag" aria-hidden="true">{g.flag}</span>
                    <b>{g.label}</b>
                  </span>
                </td>
                <td className="left cell-sub">{g.sublabel}</td>
                {grouping !== 'mercato' && <td className="num">{count(g.count)}</td>}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-foot">
        <span>
          {count(Math.min(limit, groups.length))} sur {count(groups.length)} ligne{groups.length > 1 ? 's' : ''}
        </span>
        {limit < groups.length && (
          <button className="btn" onClick={() => setLimit((l) => l + PAGE * 4)}>Afficher plus</button>
        )}
        <div className="spacer" />
        {grouping === 'mercato' && <span>Cliquez sur une ligne pour ouvrir le détail du mercato</span>}
        <button className="btn" onClick={exportCsv}>Exporter en CSV</button>
      </div>
    </>
  );
}
