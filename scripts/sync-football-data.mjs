import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { COMPETITIONS, finaliseSnapshot, normaliseSnapshot } from './lib/freshness.mjs';

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
const next = finaliseSnapshot(current, previous);

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.part`;
await writeFile(temporaryPath, `${JSON.stringify(next)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(
  `football-data.org : ${next.meta.teamCount} équipes, ${next.meta.playerCount} joueurs, `
  + `${next.meta.newSignalCount} nouvel(aux) écart(s).`,
);
