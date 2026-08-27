import type { Totals } from '../lib/aggregate';
import { count, money } from '../lib/format';

export function Kpis({ t }: { t: Totals }) {
  return (
    <section className="market-kpis" aria-label="Synthèse financière">
      <article>
        <header><span>01</span><b>Achats</b><i aria-hidden="true">↘</i></header>
        <strong className="num neg">{money(t.spend)}</strong>
        <small>{count(t.arrivals)} arrivées</small>
      </article>
      <article>
        <header><span>02</span><b>Ventes</b><i aria-hidden="true">↗</i></header>
        <strong className="num pos">{money(t.income)}</strong>
        <small>{count(t.departures)} départs</small>
      </article>
      <article>
        <header><span>03</span><b>Bilan net</b><i aria-hidden="true">±</i></header>
        <strong className={`num ${t.balance >= 0 ? 'pos' : 'neg'}`}>{money(t.balance, { sign: true })}</strong>
        <small>{t.balance >= 0 ? 'Excédent net' : 'Déficit net'}</small>
      </article>
      <div className="scope-summary">
        <span>Échantillon filtré</span>
        <strong><b>{count(t.clubs)}</b> clubs</strong>
        <strong><b>{count(t.mercatos)}</b> fenêtres</strong>
      </div>
    </section>
  );
}
