import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_BASE = 'https://find-and-update.company-information.service.gov.uk';
const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

const [registry, france, england] = await Promise.all([
  readJson('data/finance/registry.json'),
  readJson('data/finance/generated/fr-2023.json'),
  readJson('data/finance/reviewed/en-2025.json'),
]);

const dncgSource = {
  provider: registry.france.provider,
  title: `Comptes individuels des clubs — saison ${registry.france.season}`,
  url: 'https://www.sta.lfp.fr/reports-dncg',
  documentUrl: registry.france.documentUrl,
  publicationDate: '2024-04-12',
};

const englishById = new Map(registry.england.clubs.map((club) => [club.id, club]));
const records = [
  ...france.map((record) => ({ ...record, source: dncgSource })),
  ...england.map((record) => {
    const entity = englishById.get(record.id);
    if (!entity) throw new Error(`${record.id}: société Companies House absente du registre`);
    return {
      ...record,
      source: {
        provider: registry.england.provider,
        title: `Comptes déposés — exercice clos le ${record.periodEnd}`,
        url: `${PUBLIC_BASE}/company/${entity.companyNumber}/filing-history`,
        documentUrl: `${PUBLIC_BASE}${entity.reviewedFilingPath}`,
        publicationDate: null,
      },
    };
  }),
];

const countries = [...new Set(records.map((record) => record.country))].map((country) => {
  const subset = records.filter((record) => record.country === country);
  return {
    country,
    clubCount: subset.length,
    periodEnds: [...new Set(subset.map((record) => record.periodEnd))].sort(),
    currency: subset[0].currency,
  };
});

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    clubCount: records.length,
    countries,
    methodology: 'Comptes annuels publiés, montants en milliers dans la devise du dépôt. Aucun taux de change et aucune estimation.',
    comparabilityNote: 'Les périmètres juridiques et dates de clôture diffèrent. Comparer en priorité au sein d’un même pays et d’un même exercice.',
  },
  records,
};

const destination = join(ROOT, 'public', 'data', 'finance.json');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(`OK finances : ${records.length} comptes publiés vers public/data/finance.json`);
