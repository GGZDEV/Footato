import type { Totals } from '../lib/aggregate';
import { count, money } from '../lib/format';

export function Kpis({ t }: { t: Totals }) {
  const disclosed = t.paidDeals + t.undisclosed;
  const coverage = disclosed ? (t.paidDeals / disclosed) * 100 : 100;
  const quality = coverage >= 80 ? 'forte' : coverage >= 60 ? 'moyenne' : 'faible';

  return (
    <section className="kpis">
      <div className="panel kpi">
        <span className="field-label">Achats</span>
        <div className="value num neg">{money(t.spend)}</div>
        <div className="sub">{count(t.arrivals)} arrivées</div>
      </div>
      <div className="panel kpi">
        <span className="field-label">Ventes</span>
        <div className="value num pos">{money(t.income)}</div>
        <div className="sub">{count(t.departures)} départs</div>
      </div>
      <div className="panel kpi">
        <span className="field-label">Bilan</span>
        <div className={`value num ${t.balance >= 0 ? 'pos' : 'neg'}`}>{money(t.balance, { sign: true })}</div>
        <div className="sub">{t.balance >= 0 ? 'Excédent net' : 'Déficit net'}</div>
      </div>
      <div className="panel kpi">
        <span className="field-label">Périmètre</span>
        <div className="value num">{count(t.mercatos)}</div>
        <div className="sub">
          mercatos · {count(t.clubs)} clubs · {coverage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}% des indemnités trouvées
        </div>
      </div>
      <div className={`quality-banner quality-${quality}`}>
        <div>
          <span className="field-label">Complétude des indemnités</span>
          <strong>{coverage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}% trouvées</strong>
        </div>
        <p>
          {count(t.paidDeals)} indemnités publiques et <b>{count(t.undisclosed)} explicitement indisponibles</b>.
          Retraites, sans-club, réserves, transferts libres et prêts sans indemnité sont exclus du taux.
        </p>
        <span className="quality-score">{coverage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%</span>
      </div>
    </section>
  );
}
