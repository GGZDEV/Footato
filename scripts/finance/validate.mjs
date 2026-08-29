import { readFile } from 'node:fs/promises';

const path = new URL('../../public/data/finance.json', import.meta.url);
const dataset = JSON.parse(await readFile(path, 'utf8'));
const errors = [];
const ids = new Set();
const metricNames = [
  'revenue', 'broadcasting', 'commercial', 'matchday', 'otherRevenue', 'payroll',
  'playerAmortisation', 'agentFees', 'operatingExpenses', 'operatingResult',
  'playerTrading', 'preTaxResult', 'netResult', 'intangibleAssets',
  'transferReceivables', 'cash', 'totalAssets', 'equity', 'shareholderLoans',
  'financialDebt', 'transferPayables', 'totalLiabilities',
];

for (const record of dataset.records ?? []) {
  if (ids.has(record.id)) errors.push(`${record.id}: identifiant dupliqué`);
  ids.add(record.id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.periodEnd)) errors.push(`${record.id}: date de clôture invalide`);
  if (!['EUR', 'GBP'].includes(record.currency)) errors.push(`${record.id}: devise invalide`);
  if (!record.source?.documentUrl) errors.push(`${record.id}: document source absent`);
  for (const name of metricNames) {
    const amount = record.metrics?.[name];
    if (amount !== null && !Number.isFinite(amount)) errors.push(`${record.id}.${name}: montant invalide`);
  }
  if (!(record.metrics?.revenue > 0)) errors.push(`${record.id}: revenus absents`);
  if (!(record.metrics?.totalAssets > 0)) errors.push(`${record.id}: total actif absent`);
  const parts = ['broadcasting', 'commercial', 'matchday', 'otherRevenue'].map((name) => record.metrics[name]);
  if (parts.every((amount) => amount !== null)) {
    const delta = Math.abs(parts.reduce((sum, amount) => sum + amount, 0) - record.metrics.revenue);
    if (delta > 2) errors.push(`${record.id}: ventilation des revenus incohérente (${delta})`);
  }
  const balanceDelta = record.balanceConvention === 'assets-equals-liabilities'
    ? Math.abs(record.metrics.totalAssets - record.metrics.totalLiabilities)
    : Math.abs(record.metrics.totalAssets - record.metrics.totalLiabilities - record.metrics.equity);
  if (balanceDelta > 2) errors.push(`${record.id}: bilan déséquilibré (${balanceDelta})`);
}

if (dataset.meta?.clubCount !== ids.size) errors.push('meta.clubCount incohérent');
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log(`OK finances : ${ids.size} clubs, bilans et ventilations cohérents`);
