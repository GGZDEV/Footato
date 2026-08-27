import type { Totals } from '../lib/aggregate';
import { count, money } from '../lib/format';

export function Kpis({ t }: { t: Totals }) {
  return (
    <section className="market-kpis" aria-label="Synthèse financière">
      <article>
        <span>Achats</span>
        <strong className="num neg">{money(t.spend)}</strong>
        <small>{count(t.arrivals)} arrivées</small>
      </article>
      <article>
        <span>Ventes</span>
        <strong className="num pos">{money(t.income)}</strong>
        <small>{count(t.departures)} départs</small>
      </article>
      <article>
        <span>Bilan</span>
        <strong className={`num ${t.balance >= 0 ? 'pos' : 'neg'}`}>{money(t.balance, { sign: true })}</strong>
        <small>{t.balance >= 0 ? 'Excédent net' : 'Déficit net'}</small>
      </article>
      <div className="scope-summary">
        <b>{count(t.clubs)}</b> clubs
        <span aria-hidden="true">·</span>
        <b>{count(t.mercatos)}</b> fenêtres
      </div>
    </section>
  );
}
