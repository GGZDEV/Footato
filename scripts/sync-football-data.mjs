import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { COMPETITIONS, finaliseSnapshot, normaliseHonours, normaliseSnapshot } from './lib/freshness.mjs';
import { buildHonoursCatalog, HONOURS_CATALOG_VERSION } from './lib/honours-catalog.mjs';

const token = process.env.FOOTBALL_DATA_TOKEN;
const outputPath = resolve('public/data/freshness.json');
const previousUrl = process.env.FOOTBALL_DATA_PREVIOUS_URL
  || 'https://ggzdev.github.io/Footato/data/freshness.json';
const apiBase = process.env.FOOTBALL_DATA_API_BASE || 'https://api.football-data.org/v4';

async function readLocalPrevious() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

async function readPrevious() {
  try {
    const separator = previousUrl.includes('?') ? '&' : '?';
    const response = await fetch(`${previousUrl}${separator}t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) return response.json();
  } catch {
    // A first deployment has no remote baseline yet; local seed is the fallback.
  }
  return readLocalPrevious();
}

async function fetchCompetition(code) {
  const response = await fetch(`${apiBase}/competitions/${code}/teams`, {
    headers: {
      Accept: 'application/json',
      'X-Auth-Token': token,
      'User-Agent': 'Footato/1.0 (https://ggzdev.github.io/Footato/)',
    },
  });
  if (!response.ok) {
    const retry = response.headers.get('retry-after');
    throw new Error(`football-data.org ${code}: HTTP ${response.status}${retry ? ` (retry-after ${retry}s)` : ''}`);
  }
  return { code, payload: await response.json() };
}

async function fetchCompetitionHistory(code) {
  const response = await fetch(`${apiBase}/competitions/${code}`, {
    headers: {
      Accept: 'application/json',
      'X-Auth-Token': token,
      'User-Agent': 'Footato/1.0 (https://ggzdev.github.io/Footato/)',
    },
  });
  if (!response.ok) throw new Error(`football-data.org historique ${code}: HTTP ${response.status}`);
  return { code, payload: await response.json() };
}

if (!token) {
  if (process.env.CI === 'true') {
    throw new Error('Le secret GitHub FOOTBALL_DATA_TOKEN est absent.');
  }
  console.log('FOOTBALL_DATA_TOKEN absent : état football-data.org conservé pour le développement local.');
  process.exit(0);
}

const fetchedAt = new Date().toISOString();
const previous = await readPrevious();
const responses = [];
for (const competition of COMPETITIONS) {
  responses.push(await fetchCompetition(competition.code));
}

const current = normaliseSnapshot(responses, fetchedAt);
if (current.meta.playerCount === 0) {
  throw new Error('football-data.org n’a retourné aucun joueur : publication interrompue.');
}
const summary = JSON.parse(await readFile(resolve('public/data/summary.json'), 'utf8'));
const honoursAge = previous?.honours?.meta?.fetchedAt
  ? (Date.now() - new Date(previous.honours.meta.fetchedAt).valueOf()) / 86_400_000
  : Infinity;
if (previous?.honours?.meta?.status === 'ready'
  && previous.honours.meta.catalogVersion === HONOURS_CATALOG_VERSION
  && honoursAge < 30) {
  current.honours = previous.honours;
} else if (previous?.honours?.meta?.status === 'ready'
  && previous.honours.meta.provider === 'football-data.org'
  && previous.honours.titles?.length) {
  // Upgrade the previously collected API history immediately, without consuming more quota.
  current.honours = buildHonoursCatalog(summary, previous.honours, fetchedAt);
} else {
  // The free plan allows 10 requests/minute. Eight team calls have just run.
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 61_000));
  const historyResponses = [];
  for (const competition of COMPETITIONS) historyResponses.push(await fetchCompetitionHistory(competition.code));
  const apiHonours = normaliseHonours(historyResponses, summary, fetchedAt);
  current.honours = buildHonoursCatalog(summary, apiHonours, fetchedAt);
}
const next = finaliseSnapshot(current, previous);

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.part`;
await writeFile(temporaryPath, `${JSON.stringify(next)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(
  `football-data.org : ${next.meta.teamCount} équipes, ${next.meta.playerCount} joueurs, `
  + `${next.meta.newSignalCount} nouvel(aux) écart(s).`,
);
console.log(
  `Palmarès : ${next.honours.meta.matchedTitleCount}/${next.honours.meta.titleCount} titres rattachés `
  + `(${next.honours.meta.yearMin ?? '—'}-${next.honours.meta.yearMax ?? '—'}).`,
);
