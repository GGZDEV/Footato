import { useMemo, useState } from 'react';
import type { SeasonPoint } from '../lib/aggregate';
import { money, season, windowShort } from '../lib/format';
import { niceTicks, useMeasure } from '../lib/useMeasure';

const DESKTOP_HEIGHT = 250;

interface Props {
  points: SeasonPoint[];
  onSelect?: (p: SeasonPoint) => void;
}

export function SeasonChart({ points, onSelect }: Props) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const compact = width > 0 && width < 560;
  const height = compact ? 210 : DESKTOP_HEIGHT;
  const margin = compact
    ? { top: 18, right: 10, bottom: 25, left: 48 }
    : { top: 22, right: 58, bottom: 28, left: 62 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const { ticks, max } = useMemo(() => {
    const peak = points.reduce((n, p) => Math.max(n, p.spend, p.income), 0);
    const t = niceTicks(peak, 4);
    return { ticks: t, max: t[t.length - 1] || 1 };
  }, [points]);

  if (points.length === 0) {
    return <div className="chart-body"><p className="hint">Aucune donnée pour ces filtres.</p></div>;
  }

  const x = (i: number) => (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => innerH - (v / max) * innerH;
  const path = (get: (p: SeasonPoint) => number) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join('');

  // Keep roughly 60px between x labels so seasons never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 60))));
  const last = points.length - 1;
  const active = hover === null ? null : points[hover];

  return (
    <div className="chart-body">
      <div className="legend" style={{ marginBottom: 10 }}>
        <span className="key"><i className="swatch" style={{ background: 'var(--out)' }} />Achats</span>
        <span className="key"><i className="swatch" style={{ background: 'var(--in)' }} />Ventes</span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
          {points.length} fenêtre{points.length > 1 ? 's' : ''} de transfert
        </span>
      </div>

      <div ref={ref} style={{ position: 'relative' }}>
        {width > 0 && (
          <svg className="chart-svg" width={width} height={height} role="img"
            aria-label={`Achats et ventes par fenêtre de transfert, de ${points[0].label} à ${points[last].label}`}>
            <g transform={`translate(${margin.left},${margin.top})`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line className="grid-line" x1={0} x2={innerW} y1={y(t)} y2={y(t)} />
                  <text className="axis-text" x={-10} y={y(t)} textAnchor="end" dominantBaseline="middle">
                    {t === 0 ? '0' : money(t)}
                  </text>
                </g>
              ))}

              {points.map((p, i) =>
                i % labelEvery === 0 || i === last ? (
                  <text key={p.label} className="axis-text" x={x(i)} y={innerH + 16} textAnchor="middle">
                    {season(p.year).slice(2)}{windowShort(p.window)}
                  </text>
                ) : null,
              )}

              <path d={path((p) => p.spend)} fill="none" stroke="var(--out)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <path d={path((p) => p.income)} fill="none" stroke="var(--in)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

              {/* Endpoint markers double as the direct labels for each series. */}
              <circle cx={x(last)} cy={y(points[last].spend)} r={4} fill="var(--out)" stroke="var(--surface)" strokeWidth={2} />
              <circle cx={x(last)} cy={y(points[last].income)} r={4} fill="var(--in)" stroke="var(--surface)" strokeWidth={2} />
              {!compact && (
                <>
                  <text className="axis-text" x={x(last) + 9} y={y(points[last].spend)} dominantBaseline="middle">{money(points[last].spend)}</text>
                  <text className="axis-text" x={x(last) + 9} y={y(points[last].income)} dominantBaseline="middle">{money(points[last].income)}</text>
                </>
              )}

              {hover !== null && (
                <g>
                  <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={0} y2={innerH} />
                  <circle cx={x(hover)} cy={y(points[hover].spend)} r={4.5} fill="var(--out)" stroke="var(--surface)" strokeWidth={2} />
                  <circle cx={x(hover)} cy={y(points[hover].income)} r={4.5} fill="var(--in)" stroke="var(--surface)" strokeWidth={2} />
                </g>
              )}

              <rect
                x={0} y={0} width={innerW || 1} height={innerH} fill="transparent"
                style={{ cursor: onSelect ? 'pointer' : 'crosshair' }}
                onPointerLeave={() => setHover(null)}
                onPointerMove={(e) => {
                  const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                  const ratio = (e.clientX - box.left) / (box.width || 1);
                  setHover(Math.min(last, Math.max(0, Math.round(ratio * last))));
                }}
                onClick={(e) => {
                  if (!onSelect) return;
                  const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                  const ratio = (e.clientX - box.left) / (box.width || 1);
                  const index = Math.min(last, Math.max(0, Math.round(ratio * last)));
                  setHover(index);
                  onSelect(points[index]);
                }}
              />
            </g>
          </svg>
        )}

        {active && (
          <div
            className="tooltip"
            style={{
              left: Math.min(Math.max(margin.left + x(hover!) - 80, 0), Math.max(0, width - 175)),
              top: 4,
            }}
          >
            <div className="t-title">{active.label}</div>
            <div className="t-row"><i className="swatch" style={{ background: 'var(--out)' }} />Achats<span className="t-val">{money(active.spend)}</span></div>
            <div className="t-row"><i className="swatch" style={{ background: 'var(--in)' }} />Ventes<span className="t-val">{money(active.income)}</span></div>
            <div className="t-sep" />
            <div className="t-row">
              <span className="muted">Bilan</span>
              <span className={`t-val ${active.balance >= 0 ? 'pos' : 'neg'}`}>{money(active.balance, { sign: true })}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
