import { useMemo, useState } from 'react';
import type { FinanceDataset, FinanceRecord } from '../lib/types';

type FinanceSortKey = 'name' | 'revenue' | 'payrollRatio' | 'netResult' | 'equity' | 'cash';

interface Props {
  dataset: FinanceDataset;
}

const symbol = (currency: FinanceRecord['currency']) => currency === 'EUR' ? '€' : '£';

/** Published values are stored in thousands; the UI promotes them to readable M/Md. */
function money(amount: number | null, currency: FinanceRecord['currency'], signed = false): string {
  if (amount == null) return '—';
  const sign = signed && amount > 0 ? '+' : '';
  const absolute = Math.abs(amount);
  const digits = absolute >= 100_000 ? 0 : 1;
  if (absolute >= 1_000_000) return `${sign}${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md${symbol(currency)}`;
  if (absolute >= 1_000) return `${sign}${(amount / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: digits })} M${symbol(currency)}`;
  return `${sign}${amount.toLocaleString('fr-FR')} k${symbol(currency)}`;
}

const ratio = (numerator: number | null, denominator: number | null) => (
  numerator == null || denominator == null || denominator === 0 ? null : numerator / denominator * 100
);

const percent = (value: number | null) => value == null ? '—' : `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

const fiscalLabel = (record: FinanceRecord) => {
  const date = new Date(`${record.periodEnd}T12:00:00Z`);
  return `Clôture ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)}`;
};

const sortValue = (record: FinanceRecord, key: FinanceSortKey): number | string | null => {
  if (key === 'name') return record.name;
  if (key === 'payrollRatio') return ratio(record.metrics.payroll, record.metrics.revenue);
  return record.metrics[key];
};

export function FinanceView({ dataset }: Props) {
  const [country, setCountry] = useState<FinanceRecord['country']>('France');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: FinanceSortKey; dir: 1 | -1 }>({ key: 'revenue', dir: -1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const countryRecords = useMemo(
    () => dataset.records.filter((record) => record.country === country),
    [dataset, country],
  );
  const records = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('fr');
    return countryRecords
      .filter((record) => !term || record.name.toLocaleLowerCase('fr').includes(term))
      .sort((a, b) => {
        const av = sortValue(a, sort.key);
        const bv = sortValue(b, sort.key);
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv, 'fr') * sort.dir;
        return ((av as number) - (bv as number)) * sort.dir;
      });
  }, [countryRecords, query, sort]);
  const selected = records.find((record) => record.id === selectedId) ?? records[0] ?? countryRecords[0];
  const currency = countryRecords[0]?.currency ?? 'EUR';
  const totals = useMemo(() => countryRecords.reduce((acc, record) => ({
    revenue: acc.revenue + record.metrics.revenue,
    payroll: acc.payroll + (record.metrics.payroll ?? 0),
    equity: acc.equity + (record.metrics.equity ?? 0),
    profitable: acc.profitable + ((record.metrics.netResult ?? 0) > 0 ? 1 : 0),
  }), { revenue: 0, payroll: 0, equity: 0, profitable: 0 }), [countryRecords]);

  const changeCountry = (next: FinanceRecord['country']) => {
    setCountry(next);
    setSelectedId(null);
    setQuery('');
  };
  const onSort = (key: FinanceSortKey) => setSort((current) => current.key === key
    ? { key, dir: (current.dir * -1) as 1 | -1 }
    : { key, dir: key === 'name' ? 1 : -1 });
  const ariaSort = (key: FinanceSortKey) => sort.key !== key ? undefined : sort.dir === 1 ? 'ascending' : 'descending';

  return (
    <section className="content-section finance-section" aria-labelledby="finance-heading">
      <div className="finance-hero">
        <div>
          <span className="eyebrow-label"><i aria-hidden="true" /> Observatoire des comptes</span>
          <h1 id="finance-heading">L’économie<br /><em>des clubs.</em></h1>
          <p>Revenus, masse salariale, résultats et solidité du bilan — tirés des comptes annuels officiels, sans mélanger ces données avec le mercato.</p>
        </div>
        <aside aria-label="Périmètre financier du MVP">
          <span>MVP · France + Angleterre</span>
          <strong>{dataset.meta.clubCount}</strong>
          <p>comptes de clubs normalisés</p>
          <small>Montants natifs · aucune conversion de devise</small>
        </aside>
      </div>

      <div className="finance-country-switch" role="group" aria-label="Pays à analyser">
        {dataset.meta.countries.map((item) => (
          <button key={item.country} aria-pressed={country === item.country} onClick={() => changeCountry(item.country)}>
            <span>{item.country}</span>
            <b>{item.clubCount} clubs</b>
            <small>Clôture {new Date(`${item.periodEnds.at(-1)}T12:00:00Z`).getUTCFullYear()} · {item.currency}</small>
          </button>
        ))}
      </div>

      <p className="finance-caveat">
        <b>{country === 'France' ? 'DNCG 2022/23' : 'Companies House 2025'}.</b>{' '}
        {country === 'France'
          ? 'Il s’agit du dernier rapport de comptes individuels actuellement publié dans l’archive LFP.'
          : 'Les trois premiers clubs anglais forment un échantillon MVP ; de nouvelles sociétés peuvent être ajoutées au registre.'}
      </p>

      <div className="finance-kpis" aria-label={`Indicateurs agrégés — ${country}`}>
        <article><span>Revenus cumulés</span><strong>{money(totals.revenue, currency)}</strong><small>addition des comptes affichés</small></article>
        <article><span>Poids des salaires</span><strong>{percent(ratio(totals.payroll, totals.revenue))}</strong><small>masse salariale / revenus</small></article>
        <article><span>Clubs bénéficiaires</span><strong>{totals.profitable}<i> / {countryRecords.length}</i></strong><small>résultat net strictement positif</small></article>
        <article><span>Fonds propres</span><strong>{money(totals.equity, currency, true)}</strong><small>cumul, périmètres publiés</small></article>
      </div>

      <div className="finance-workspace">
        <section className="panel finance-ranking" aria-labelledby="finance-ranking-title">
          <div className="finance-panel-head">
            <div><span className="eyebrow-label">Comparateur</span><h2 id="finance-ranking-title">Clubs · {country}</h2></div>
            <label><span>Rechercher</span><input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du club" /></label>
          </div>

          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead><tr>
                <th aria-sort={ariaSort('name')}><button onClick={() => onSort('name')}>Club</button></th>
                <th aria-sort={ariaSort('revenue')}><button onClick={() => onSort('revenue')}>Revenus</button></th>
                <th aria-sort={ariaSort('payrollRatio')}><button onClick={() => onSort('payrollRatio')}>Salaires / rev.</button></th>
                <th aria-sort={ariaSort('netResult')}><button onClick={() => onSort('netResult')}>Résultat net</button></th>
                <th aria-sort={ariaSort('equity')}><button onClick={() => onSort('equity')}>Fonds propres</button></th>
                <th aria-sort={ariaSort('cash')}><button onClick={() => onSort('cash')}>Trésorerie</button></th>
              </tr></thead>
              <tbody>{records.map((record) => (
                <tr key={record.id} className={record.id === selected?.id ? 'active clickable' : 'clickable'} tabIndex={0} onClick={() => setSelectedId(record.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(record.id); } }}>
                  <td><b>{record.name}</b><small>{fiscalLabel(record)}</small></td>
                  <td>{money(record.metrics.revenue, record.currency)}</td>
                  <td>{percent(ratio(record.metrics.payroll, record.metrics.revenue))}</td>
                  <td className={(record.metrics.netResult ?? 0) >= 0 ? 'finance-positive' : 'finance-negative'}>{money(record.metrics.netResult, record.currency, true)}</td>
                  <td>{money(record.metrics.equity, record.currency, true)}</td>
                  <td>{money(record.metrics.cash, record.currency)}</td>
                </tr>
              ))}</tbody>
            </table>

            <div className="finance-mobile-list">{records.map((record) => (
              <button key={record.id} className={record.id === selected?.id ? 'active' : ''} onClick={() => setSelectedId(record.id)}>
                <span><b>{record.name}</b><small>{fiscalLabel(record)}</small></span>
                <span><small>Revenus</small><b>{money(record.metrics.revenue, record.currency)}</b></span>
                <span><small>Résultat net</small><b className={(record.metrics.netResult ?? 0) >= 0 ? 'finance-positive' : 'finance-negative'}>{money(record.metrics.netResult, record.currency, true)}</b></span>
              </button>
            ))}</div>
          </div>
          <div className="table-foot"><span>{records.length} club{records.length > 1 ? 's' : ''} · montants en {currency === 'EUR' ? 'euros' : 'livres sterling'}</span></div>
        </section>

        {selected && <FinanceClubCard record={selected} />}
      </div>

      <section className="finance-method" aria-labelledby="finance-method-title">
        <div><span className="eyebrow-label">Règle de lecture</span><h2 id="finance-method-title">Comparable, mais pas interchangeable.</h2></div>
        <p>{dataset.meta.comparabilityNote} Les champs absents restent vides : Footato ne reconstitue pas un poste que le club n’a pas isolé.</p>
        <dl>
          <div><dt>Revenus</dt><dd>hors produit de cession des joueurs</dd></div>
          <div><dt>Résultat joueurs</dt><dd>plus-value publiée, après coûts lorsque le format l’impose</dd></div>
          <div><dt>Fonds propres</dt><dd>coussin comptable, pas valeur de marché du club</dd></div>
        </dl>
      </section>
    </section>
  );
}

function FinanceClubCard({ record }: { record: FinanceRecord }) {
  const { metrics } = record;
  const wageRatio = ratio(metrics.payroll, metrics.revenue);
  const operatingMargin = ratio(metrics.operatingResult, metrics.revenue);
  const equityRatio = ratio(metrics.equity, metrics.totalAssets);
  const breakdown = [
    { label: 'TV', amount: metrics.broadcasting, className: 'broadcast' },
    { label: 'Commercial', amount: metrics.commercial, className: 'commercial' },
    { label: 'Stade', amount: metrics.matchday, className: 'matchday' },
    { label: 'Autres', amount: metrics.otherRevenue, className: 'other' },
  ];
  const hasBreakdown = breakdown.every((item) => item.amount != null);

  return <aside className="panel finance-detail" aria-labelledby="finance-club-title">
    <header>
      <span className="finance-source-badge">{record.source.provider}</span>
      <h2 id="finance-club-title">{record.name}</h2>
      <p>{record.league} · {fiscalLabel(record)}</p>
    </header>

    <div className="finance-result-card">
      <span>Résultat net</span>
      <strong className={(metrics.netResult ?? 0) >= 0 ? 'finance-positive' : 'finance-negative'}>{money(metrics.netResult, record.currency, true)}</strong>
      <small>Marge opérationnelle {percent(operatingMargin)}</small>
    </div>

    <div className="finance-ratio-grid">
      <div><span>Salaires / revenus</span><strong>{percent(wageRatio)}</strong></div>
      <div><span>Fonds propres / actif</span><strong>{percent(equityRatio)}</strong></div>
      <div><span>Trading joueurs</span><strong>{money(metrics.playerTrading, record.currency, true)}</strong></div>
      <div><span>Actifs incorporels</span><strong>{money(metrics.intangibleAssets, record.currency)}</strong></div>
    </div>

    <section className="finance-mix">
      <div><h3>Mix de revenus</h3><span>{money(metrics.revenue, record.currency)}</span></div>
      {hasBreakdown ? <>
        <div className="finance-mix-bar" aria-label="Répartition des revenus">{breakdown.map((item) => (
          <i key={item.label} className={item.className} style={{ width: `${(item.amount ?? 0) / metrics.revenue * 100}%` }} title={`${item.label} : ${money(item.amount, record.currency)}`} />
        ))}</div>
        <ul>{breakdown.map((item) => <li key={item.label} className={item.className}><i />{item.label}<b>{percent(ratio(item.amount, metrics.revenue))}</b></li>)}</ul>
      </> : <p className="finance-missing">Ventilation non comparable dans le format publié.</p>}
    </section>

    <dl className="finance-balance-list">
      <div><dt>Trésorerie</dt><dd>{money(metrics.cash, record.currency)}</dd></div>
      <div><dt>Total actif</dt><dd>{money(metrics.totalAssets, record.currency)}</dd></div>
      <div><dt>Fonds propres</dt><dd>{money(metrics.equity, record.currency, true)}</dd></div>
      <div><dt>Créances transferts</dt><dd>{money(metrics.transferReceivables, record.currency)}</dd></div>
      <div><dt>Dettes transferts</dt><dd>{money(metrics.transferPayables, record.currency)}</dd></div>
      <div><dt>Amort. joueurs</dt><dd>{money(metrics.playerAmortisation, record.currency)}</dd></div>
    </dl>

    <footer>
      <div><b>{record.scope}</b><small>{record.reviewNote}</small>{record.companyNumber && <small>Société n° {record.companyNumber}</small>}</div>
      <a href={record.source.documentUrl} target="_blank" rel="noreferrer">Voir le document officiel <span aria-hidden="true">↗</span></a>
    </footer>
  </aside>;
}
