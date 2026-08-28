import { useEffect, useMemo, useState } from 'react';
import { resolve } from '../lib/aggregate';
import { loadWindow } from '../lib/data';
import { count, money, season, windowLabel, windowYear } from '../lib/format';
import { KIND_LABELS, type Counts, type Dataset, type Mercato, type Movement } from '../lib/types';
import { Flag } from './Flag';

interface Props {
  mercatos: Mercato[];
  dataset: Dataset;
  includeLoanFees: boolean;
  onClose: () => void;
}

const SEGMENTS: { key: Exclude<keyof Counts, 'total' | 'loanFee'>; label: string; color: string }[] = [
  { key: 'paid', label: 'Payants', color: 'var(--out)' },
  { key: 'free', label: 'Libres', color: 'var(--accent)' },
  { key: 'loan', label: 'Prêts', color: 'var(--text-3)' },
  { key: 'freeOrLoan', label: 'Libres ou prêts', color: 'color-mix(in srgb, var(--accent) 55%, var(--text-3))' },
  { key: 'undisclosed', label: 'Non divulgués', color: 'var(--surface-3)' },
  { key: 'notApplicable', label: 'Administratifs', color: 'var(--line-strong)' },
];

function Breakdown({ title, counts }: { title: string; counts: Counts }) {
  return (
    <div className="col">
      <div className="breakdown-title"><h3>{title}</h3><strong>{count(counts.total)}</strong></div>
      <dl>
        {SEGMENTS.filter((segment) => segment.key !== 'freeOrLoan' || counts.freeOrLoan > 0).map((segment) => (
          <div key={segment.key} style={{ display: 'contents' }}>
            <dt>{segment.label}</dt><dd>{count(counts[segment.key])}</dd>
          </div>
        ))}
      </dl>
      <div className="stack" aria-hidden="true">
        {SEGMENTS.map((segment) => counts[segment.key]
          ? <i key={segment.key} style={{ background: segment.color, flex: counts[segment.key] }} />
          : null)}
      </div>
    </div>
  );
}

export function MercatoDetail({ mercatos, dataset, includeLoanFees, onClose }: Props) {
  const ordered = useMemo(() => [...mercatos].sort((a, b) => a.window - b.window), [mercatos]);
  const [activeWindow, setActiveWindow] = useState<0 | 1>(ordered[0]?.window ?? 0);
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const identity = ordered[0];
  const active = ordered.find((item) => item.window === activeWindow) ?? ordered[0];

  useEffect(() => setActiveWindow(ordered[0]?.window ?? 0), [identity?.clubId, identity?.year, ordered]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setMovements(null);
    loadWindow(active.league.id, active.year, active.window, dataset.clubs).then((all) => {
      if (alive) setMovements(all.filter((movement) => movement.clubId === active.clubId));
    });
    return () => { alive = false; };
  }, [active, dataset.clubs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totals = useMemo(() => ordered.reduce((result, item) => {
    const resolved = resolve(item, includeLoanFees);
    result.spend += resolved.spend;
    result.income += resolved.income;
    result.arrivals += item.arrivals.total;
    result.departures += item.departures.total;
    return result;
  }, { spend: 0, income: 0, arrivals: 0, departures: 0 }), [ordered, includeLoanFees]);
  const balance = totals.income - totals.spend;
  const activeResolved = active ? resolve(active, includeLoanFees) : null;
  const sortedMovements = useMemo(() => movements && [...movements].sort((a, b) => b.amount - a.amount || a.dir - b.dir), [movements]);

  if (!identity || !active || !activeResolved) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Mercato ${season(identity.year)} — ${identity.club}`}>
        <div className="drawer-head">
          <div className="eyebrow"><Flag code={identity.league.code} label={identity.league.country} />{identity.league.name}</div>
          <h2>{identity.club}</h2>
          <p>Mercato {season(identity.year)} · été et hiver réunis</p>
          <button className="close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div className="drawer-body">
          <section className="annual-summary" aria-label="Bilan annuel">
            <div><span>Achats</span><strong className="num neg">{money(totals.spend)}</strong><small>{count(totals.arrivals)} arrivées</small></div>
            <div><span>Ventes</span><strong className="num pos">{money(totals.income)}</strong><small>{count(totals.departures)} départs</small></div>
            <div><span>Bilan</span><strong className={`num ${balance >= 0 ? 'pos' : 'neg'}`}>{money(balance, { sign: true })}</strong><small>Saison complète</small></div>
          </section>

          <section className="window-section">
            <div className="drawer-section-title"><div><span className="eyebrow-label">Détail par mercato</span><h3>Choisir un mercato</h3></div></div>
            <div className="window-switch" role="tablist" aria-label="Choisir le mercato">
              {ordered.map((item) => {
                const resolved = resolve(item, includeLoanFees);
                return (
                  <button
                    key={item.key}
                    role="tab"
                    aria-selected={active.key === item.key}
                    onClick={() => setActiveWindow(item.window)}
                  >
                    <span>{windowLabel(item.window)} <small>{windowYear(item.year, item.window)}</small></span>
                    <b className={`num ${resolved.balance >= 0 ? 'pos' : 'neg'}`}>{money(resolved.balance, { sign: true })}</b>
                    <i>{count(item.arrivals.total)} arrivées · {count(item.departures.total)} départs</i>
                  </button>
                );
              })}
              {ordered.length === 1 && (
                <div className="missing-window">L’autre mercato n’est pas disponible pour cette sélection.</div>
              )}
            </div>
          </section>

          <section className="active-window-summary">
            <div className="drawer-section-title">
              <div><span className="eyebrow-label">{windowLabel(active.window)} {windowYear(active.year, active.window)}</span><h3>Structure du mercato</h3></div>
              <strong className={`num ${activeResolved.balance >= 0 ? 'pos' : 'neg'}`}>{money(activeResolved.balance, { sign: true })}</strong>
            </div>
            <div className="breakdown">
              <Breakdown title="Arrivées" counts={active.arrivals} />
              <Breakdown title="Départs" counts={active.departures} />
            </div>
          </section>

          {(active.loanSpend > 0 || active.loanIncome > 0) && !includeLoanFees && (
            <p className="hint loan-hint">
              Les indemnités de prêt publiées ne sont pas incluses. Activez-les dans les filtres avancés pour les ajouter.
            </p>
          )}

          <section>
            <div className="drawer-section-title">
              <div><span className="eyebrow-label">Liste détaillée</span><h3>Mouvements de {windowLabel(active.window).toLowerCase()}</h3></div>
              <span>{sortedMovements ? count(sortedMovements.length) : '…'}</span>
            </div>
            {sortedMovements === null ? (
              <p className="hint">Chargement…</p>
            ) : sortedMovements.length === 0 ? (
              <p className="hint">Aucun mouvement enregistré.</p>
            ) : (
              <div className="movements">
                <table className="movement-table">
                  <thead><tr><th className="left">Sens</th><th className="left">Joueur</th><th className="left">Club</th><th className="left">Type</th><th>Montant</th></tr></thead>
                  <tbody>
                    {sortedMovements.map((movement, index) => (
                      <tr key={`${movement.player}-${movement.dir}-${index}`}>
                        <td className="left"><span className={movement.dir === 0 ? 'neg' : 'pos'}>{movement.dir === 0 ? '↓ Arrivée' : '↑ Départ'}</span></td>
                        <td className="left"><b>{movement.player}</b></td>
                        <td className="left cell-sub">{movement.counterpart || '—'}</td>
                        <td className="left"><span className="kind-tag">{KIND_LABELS[movement.kind] ?? '—'}</span></td>
                        <td className={`num ${movement.amount ? (movement.dir === 0 ? 'neg' : 'pos') : 'muted'}`}>{movement.amount ? money(movement.amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="movement-cards">
                  {sortedMovements.map((movement, index) => (
                    <div className="movement-card" key={`${movement.player}-${movement.dir}-${index}`}>
                      <div><span className={movement.dir === 0 ? 'neg' : 'pos'}>{movement.dir === 0 ? '↓ Arrivée' : '↑ Départ'}</span><strong>{movement.player}</strong><small>{movement.counterpart || 'Club inconnu'}</small></div>
                      <div><span className="kind-tag">{KIND_LABELS[movement.kind] ?? '—'}</span><strong className="num">{movement.amount ? money(movement.amount) : '—'}</strong></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
