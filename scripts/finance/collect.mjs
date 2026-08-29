import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'data', 'raw', 'finance');
const REGISTRY_PATH = join(ROOT, 'data', 'finance', 'registry.json');
const PUBLIC_BASE = 'https://find-and-update.company-information.service.gov.uk';

const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'user-agent': 'Footato finance collector/1.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < 10_000) throw new Error(`${url}: document anormalement petit (${data.length} octets)`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, data);
  return data.length;
}

const decodeHtml = (value) => value.replaceAll('&amp;', '&').replaceAll('&#x2F;', '/');

function latestAccountPath(html, companyNumber) {
  for (const row of html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (!/\baccounts?\b/i.test(text) || !/(made up to|full accounts|group of companies)/i.test(text)) continue;
    const href = row.match(/href="([^"]+\/filing-history\/[^"]+\/document[^"]*)"/i)?.[1];
    if (href) return decodeHtml(href);
  }
  throw new Error(`${companyNumber}: aucun dépôt de comptes trouvé`);
}

const canonicalFiling = (path) => path.split('?')[0];
const manifest = { collectedAt: new Date().toISOString(), france: null, england: [] };

await mkdir(RAW, { recursive: true });
const dncgPath = join(RAW, 'dncg-2022-2023.pdf');
const dncgBytes = await download(registry.france.documentUrl, dncgPath);
manifest.france = { status: 'downloaded', file: basename(dncgPath), bytes: dncgBytes };

for (const club of registry.england.clubs) {
  const historyUrl = `${PUBLIC_BASE}/company/${club.companyNumber}/filing-history`;
  const historyResponse = await fetch(historyUrl, { headers: { 'user-agent': 'Footato finance collector/1.0' } });
  if (!historyResponse.ok) throw new Error(`${club.name}: historique HTTP ${historyResponse.status}`);
  const latestPath = latestAccountPath(await historyResponse.text(), club.companyNumber);
  const reviewed = canonicalFiling(club.reviewedFilingPath);
  const latest = canonicalFiling(latestPath);
  const status = reviewed === latest ? 'reviewed' : 'pending-review';
  const destination = join(RAW, `${club.id}-${status}.pdf`);
  const bytes = await download(`${PUBLIC_BASE}${latestPath}`, destination);
  manifest.england.push({
    clubId: club.id,
    companyNumber: club.companyNumber,
    status,
    latestFilingPath: latestPath,
    reviewedFilingPath: club.reviewedFilingPath,
    file: basename(destination),
    bytes,
  });
}

await writeFile(join(RAW, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const python = process.env.FINANCE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const extraction = spawnSync(python, [
  join(ROOT, 'scripts', 'finance', 'extract-dncg.py'),
  '--pdf', dncgPath,
  '--registry', REGISTRY_PATH,
  '--out', join(ROOT, 'data', 'finance', 'generated', 'fr-2023.json'),
], { cwd: ROOT, stdio: 'inherit' });

if (extraction.error) {
  throw new Error(`Extraction DNCG impossible avec ${python}: ${extraction.error.message}. Définissez FINANCE_PYTHON.`);
}
if (extraction.status !== 0) throw new Error(`Extraction DNCG échouée (code ${extraction.status})`);

const pending = manifest.england.filter((item) => item.status === 'pending-review');
if (pending.length) {
  console.warn(`ATTENTION : ${pending.length} nouveau(x) dépôt(s) anglais à normaliser : ${pending.map((item) => item.clubId).join(', ')}`);
}
console.log(`OK finances : DNCG + ${manifest.england.length} dépôts Companies House collectés`);
