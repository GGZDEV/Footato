import { useState } from 'react';
import { money } from '../lib/format';
import { useMeasure } from '../lib/useMeasure';

export interface BarItem {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  highlight?: boolean;
  onClick?: () => void;
}

const ROW = 22;
const GAP = 2;

/** Rounded on the data end, square at the baseline. */
function barPath(y: number, x0: number, x1: number, h: number, r = 4) {
  const rr = Math.min(r, h / 2, Math.abs(x1 - x0));
  const s = x1 > x0 ? 1 : -1;
  return [
    `M${x0},${y}`,
    `L${x1 - s * rr},${y}`,
    `Q${x1},${y} ${x1},${y + rr}`,
    `L${x1},${y + h - rr}`,
    `Q${x1},${y + h} ${x1 - s * rr},${y + h}`,
    `L${x0},${y + h}`,
    'Z',
  ].join(' ');
}

function colPath(x: number, y0: number, y1: number, w: number, r = 4) {
  const rr = Math.min(r, w / 2, Math.abs(y1 - y0));
  const s = y1 < y0 ? 1 : -1;
  return [
    `M${x},${y0}`,
    `L${x},${y1 + s * rr}`,
    `Q${x},${y1} ${x + rr},${y1}`,
    `L${x + w - rr},${y1}`,
    `Q${x + w},${y1} ${x + w},${y1 + s * rr}`,
    `L${x + w},${y0}`,
    'Z',
  ].join(' ');
}

/** Horizontal diverging bars around a zero baseline — used for league rankings. */
export function DivergingBars({ items, labelWidth = 150 }: { items: BarItem[]; labelWidth?: number }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = items.reduce((n, it) => Math.max(n, Math.abs(it.value)), 0) || 1;
  const plotW = Math.max(60, width - labelWidth - 74);
  const zero = labelWidth + plotW / 2;
  const height = items.length * (ROW + GAP);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height}>
          <line className="grid-line" x1={zero} x2={zero} y1={0} y2={height} />
          {items.map((it, i) => {
            const y = i * (ROW + GAP);
            const end = zero + (it.value / max) * (plotW / 2);
            const color = it.value >= 0 ? 'var(--in)' : 'var(--out)';
            return (
              <g
                key={it.key}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={it.onClick}
                style={{ cursor: it.onClick ? 'pointer' : 'default' }}
              >
                <rect x={0} y={y} width={width} height={ROW} fill={hover === i ? 'var(--surface-2)' : 'transparent'} rx={4} />
                <text
                  x={6} y={y + ROW / 2} dominantBaseline="middle"
                  style={{ fontSize: 12, fill: it.highlight ? 'var(--text)' : 'var(--text-2)', fontWeight: it.highlight ? 650 : 400 }}
                >
                  {it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label}
                </text>
                <path d={barPath(y + 4, zero, Math.abs(end - zero) < 1 ? zero + (it.value >= 0 ? 1 : -1) : end, ROW - 8)}
                  fill={color} opacity={it.highlight ? 1 : 0.75} />
                <text
                  x={width - 6} y={y + ROW / 2} textAnchor="end" dominantBaseline="middle"
                  className="num" style={{ fontSize: 11.5, fill: it.value >= 0 ? 'var(--in)' : 'var(--out)' }}
                >
                  {money(it.value, { sign: true })}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && items[hover].sublabel && (
        <div className="tooltip" style={{ left: 8, top: hover * (ROW + GAP) - 6 }}>
          <div className="t-title">{items[hover].label}</div>
          <div className="t-row"><span className="muted">{items[hover].sublabel}</span></div>
        </div>
      )}
    </div>
  );
}

/** Vertical diverging columns over time — used for a club's window-by-window balance. */
export function DivergingColumns({ items, height = 140 }: { items: BarItem[]; height?: number }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = items.reduce((n, it) => Math.max(n, Math.abs(it.value)), 0) || 1;
  const zero = height / 2;
  const slot = items.length ? width / items.length : 0;
  const barW = Math.max(2, Math.min(24, slot - GAP));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {width > 0 && items.length > 0 && (
        <svg className="chart-svg" width={width} height={height}>
          <line className="grid-line" x1={0} x2={width} y1={zero} y2={zero} />
          {items.map((it, i) => {
            const x = i * slot + (slot - barW) / 2;
            const end = zero - (it.value / max) * (zero - 6);
            return (
              <g key={it.key}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onClick={it.onClick} style={{ cursor: it.onClick ? 'pointer' : 'default' }}>
                <rect x={i * slot} y={0} width={slot} height={height} fill={hover === i ? 'var(--surface-2)' : 'transparent'} />
                <path
                  d={colPath(x, zero, Math.abs(end - zero) < 1 ? zero - (it.value >= 0 ? 1 : -1) : end, barW)}
                  fill={it.value >= 0 ? 'var(--in)' : 'var(--out)'}
                  opacity={it.highlight ? 1 : 0.72}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(hover * slot - 70, 0), Math.max(0, width - 160)), top: -4 }}>
          <div className="t-title">{items[hover].label}</div>
          <div className="t-row">
            <span className="muted">Bilan</span>
            <span className={`t-val ${items[hover].value >= 0 ? 'pos' : 'neg'}`}>{money(items[hover].value, { sign: true })}</span>
          </div>
          {items[hover].sublabel && <div className="t-row"><span className="muted">{items[hover].sublabel}</span></div>}
        </div>
      )}
    </div>
  );
}
