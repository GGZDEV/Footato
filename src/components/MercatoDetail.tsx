import { useEffect, useMemo, useState } from 'react';
import { resolve } from '../lib/aggregate';
import { loadWindow } from '../lib/data';
import { count, mercatoLabel, money, season, windowLabel, windowYear } from '../lib/format';
import { KIND_LABELS, type Counts, type Dataset, type Mercato, type Movement } from '../lib/types';
import { DivergingBars, DivergingColumns } from './Bars';
import { Flag } from './Flag';

interface Props {
  mercato: Mercato;
  dataset: Dataset;
  includeLoanFees: boolean;
  onSelect: (m: Mercato) => void;
  onClose: () => void;
}

const SEGMENTS: { key: keyof Omit<Counts, 'total'>; label: string; color: string }[] = [
  { key: 'paid', label: 'Payants', color: 'var(--in)' },
  { key: 'free', label: 'Libres', color: 'var(--accent)' },
  { key: 'loan', label: 'Prêts', color: 'var(--text-3)' },
  { key: 'freeOrLoan', label: 'Libres ou prêts', color: 'color-mix(in srgb, var(--accent) 55%, var(--text-3))' },
  { key: 'undisclosed', label: 'Non divulgués', color: 'var(--surface-3)' },
];

function Breakdown({ title, c }: { title: string; c: Counts }) {
  return (
    <div className="col">
      <h3 style={{ marginBottom: 8 }}>{title} · {count(c.total)}</h3>
      <dl>
        {SEGMENTS.filter((s) => s.key !== 'freeOrLoan' || c.freeOrLoan > 0).map((s) => (
          <div key={s.key} style={{ display: 'contents' }}>
            <dt>{s.label}</dt>
            <dd>{count(c[s.key])}</dd>
          </div>
        ))}
      </dl>
      <div className="stack" aria-hidden="true">
        {SEGMENTS.map((s) =>
          c[s.key] ? <i key={s.key} style={{ background: s.color, flex: c[s.key] }} /> : null,
        )}
      </div>
    </div>
  );
}

export function MercatoDetail({ mercato, dataset, includeLoanFees, onSelect, onClose }: Props) {
  const [movements, setMovements] = useState<Movement[] | null>(null);

  useEffect(() => {
    let alive = true;
    setMovements(null);
    loadWindow(mercato.league.id, mercato.year, mercato.window, dataset.clubs).then((all) => {
      if (alive) setMovements(all.filter((m) => m.clubId === mercato.clubId));
    });
    return () => { alive = false; };
  }, [mercato, dataset.clubs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const r = resolve(mercato, includeLoanFees);

  /** Every club of the same league over the same window — the club's competitive context. */
  const leagueTable = useMemo(() => {
    const peers = dataset.mercatos.filter(
      (m) => m.league.id === mercato.league.id && m.year === mercato.year && m.window === mercato.window,
    );
    return peers
      .map((m) => ({ m, ...resolve(m, includeLoanFees) }))
      .sort((a, b) => b.balance - a.balance);
  }, [dataset.mercatos, mercato, includeLoanFees]);

  const rank = leagueTable.findIndex((p) => p.m.clubId === mercato.clubId) + 1;
  const spendRank =
    [...leagueTable].sort((a, b) => b.spend - a.spend).findIndex((p) => p.m.clubId === mercato.clubId) + 1;

  const history = useMemo(
    () =>
      dataset.mercatos
        .filter((m) => m.clubId === mercato.clubId)
        .sort((a, b) => a.year - b.year || a.window - b.window),
    [dataset.mercatos, mercato.clubId],
  );

  const sortedMovements = useMemo(
    () => movements && [...movements].sort((a, b) => b.amount - a.amount || a.dir - b.dir),
    [movements],
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Mercato ${mercatoLabel(mercato.year, mercato.window)} — ${mercato.club}`}>
        <div className="drawer-head">
          <div className="eyebrow">
            <Flag code={mercato.league.code} label={mercato.league.country} />
            {mercato.league.name} · {mercato.league.country}
          </div>
          <h2>{mercato.club}</h2>
          <div className="eyebrow" style={{ marginTop: 6, marginBottom: 0 }}>
            Mercato d’{windowLabel(mercato.window).toLowerCase()} {windowYear(mercato.year, mercato.window)} · saison {season(mercato.year)}
          </div>
          <button className="close" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div className="drawer-body">
          <div className="big3">
            <div className="cell">
              <span className="field-label">Achats</span>
              <div className="value num neg">{money(r.spend)}</div>
              <div className="sub">{count(mercato.arrivals.total)} arrivées · {spendRank}<sup>{spendRank === 1 ? 'er' : 'e'}</sup> budget du championnat</div>
            </div>
            <div className="cell">
              <span className="field-label">Ventes</span>
              <div className="value num pos">{money(r.income)}</div>
              <div className="sub">{count(mercato.departures.total)} départs</div>
            </div>
            <div className="cell">
              <span className="field-label">Bilan</span>
              <div className={`value num ${r.balance >= 0 ? 'pos' : 'neg'}`}>{money(r.balance, { sign: true })}</div>
              <div className="sub">{rank}<sup>{rank === 1 ? 'er' : 'e'}</sup> sur {leagueTable.length} clubs du championnat</div>
            </div>
          </div>

          {(mercato.loanSpend > 0 || mercato.loanIncome > 0) && !includeLoanFees && (
            <p className="hint">
              Non comptés ici :{' '}
              {[
                mercato.loanSpend > 0 && `${money(mercato.loanSpend)} d’indemnités de prêt versées`,
                mercato.loanIncome > 0 && `${money(mercato.loanIncome)} perçues`,
              ].filter(Boolean).join(' et ')}. Activez l’option dans les filtres pour les inclure.
            </p>
          )}

          <div>
            <h3>Structure du mercato</h3>
            <div className="breakdown">
              <Breakdown title="Arrivées" c={mercato.arrivals} />
              <Breakdown title="Départs" c={mercato.departures} />
            </div>
          </div>

          <div>
            <h3>Tous les clubs du championnat sur ce mercato</h3>
            <DivergingBars
              items={leagueTable.map((p) => ({
                key: p.m.key,
                label: p.m.club,
                sublabel: `${money(p.spend)} d’achats · ${money(p.income)} de ventes`,
                value: p.balance,
                highlight: p.m.clubId === mercato.clubId,
                onClick: () => onSelect(p.m),
              }))}
            />
          </div>

          <div>
            <h3>Historique du club — bilan par mercato</h3>
            <DivergingColumns
              items={history.map((m) => {
                const hr = resolve(m, includeLoanFees);
                return {
                  key: m.key,
                  label: mercatoLabel(m.year, m.window),
                  sublabel: `${money(hr.spend)} d’achats · ${money(hr.income)} de ventes`,
                  value: hr.balance,
                  highlight: m.key === mercato.key,
                  onClick: () => onSelect(m),
                };
              })}
            />
            <p className="hint" style={{ marginTop: 8 }}>
              {history.length} mercatos référencés, de {mercatoLabel(history[0].year, history[0].window)} à{' '}
              {mercatoLabel(history[history.length - 1].year, history[history.length - 1].window)}.
              Cliquez une colonne pour y aller.
            </p>
          </div>

          <div>
            <h3>Mouvements de la fenêtre</h3>
            {sortedMovements === null ? (
              <p className="hint">Chargement…</p>
            ) : sortedMovements.length === 0 ? (
              <p className="hint">Aucun mouvement enregistré.</p>
            ) : (
              <div className="movements">
                <table className="movement-table">
                  <thead>
                    <tr>
                      <th className="left">Sens</th>
                      <th className="left">Joueur</th>
                      <th className="left">Club concerné</th>
                      <th className="left">Type</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMovements.map((mv, i) => (
                      <tr key={`${mv.player}-${mv.dir}-${i}`}>
                        <td className="left">
                          <span className={mv.dir === 0 ? 'neg' : 'pos'}>{mv.dir === 0 ? '↓ Arrivée' : '↑ Départ'}</span>
                        </td>
                        <td className="left">{mv.player}</td>
                        <td className="left cell-sub">{mv.counterpart || '—'}</td>
                        <td className="left"><span className="kind-tag">{KIND_LABELS[mv.kind] ?? '—'}</span></td>
                        <td className={`num ${mv.amount ? (mv.dir === 0 ? 'neg' : 'pos') : 'muted'}`}>
                          {mv.amount ? money(mv.amount) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="movement-cards">
                  {sortedMovements.map((mv, i) => (
                    <div className="movement-card" key={`${mv.player}-${mv.dir}-${i}`}>
                      <div>
                        <span className={mv.dir === 0 ? 'neg' : 'pos'}>{mv.dir === 0 ? '↓ Arrivée' : '↑ Départ'}</span>
                        <strong>{mv.player}</strong>
                        <small>{mv.counterpart || 'Club inconnu'}</small>
                      </div>
                      <div>
                        <span className="kind-tag">{KIND_LABELS[mv.kind] ?? '—'}</span>
                        <strong className={`num ${mv.amount ? (mv.dir === 0 ? 'neg' : 'pos') : 'muted'}`}>
                          {mv.amount ? money(mv.amount) : '—'}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
