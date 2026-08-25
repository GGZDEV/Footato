/**
 * Downloads every upstream asset needed to rebuild the dataset.
 *
 * - ewenme/transfers is the typed historical baseline (free/loan/loan fee).
 * - dcaribou/transfermarkt-datasets is the maintained source for recent seasons.
 * - openfootball/football.json independently verifies current league membership.
 *
 * Downloads are atomic, retried, and recorded in a manifest so the UI can show
 * the upstream freshness rather than merely the local build date.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OPEN = join(RAW, 'transfermarkt-datasets');
const MEMBERSHIPS = join(RAW, 'openfootball');
const LEGACY_BASE = 'https://raw.githubusercontent.com/ewenme/transfers/master/data';
const OPEN_BASE = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data';
const now = new Date();
const currentSeasonYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const currentSeasonSlug = `${currentSeasonYear}-${String((currentSeasonYear + 1) % 100).padStart(2, '0')}`;
const OPENFOOTBALL_BASE = `https://raw.githubusercontent.com/openfootball/football.json/master/${currentSeasonSlug}`;

const LEGACY_FILES = [
  'premier-league.csv', 'primera-division.csv', 'serie-a.csv', '1-bundesliga.csv',
  'ligue-1.csv', 'liga-nos.csv', 'eredivisie.csv', 'premier-liga.csv', 'championship.csv',
];
const OPEN_FILES = ['transfers.csv.gz', 'clubs.csv.gz', 'competitions.csv.gz', 'games.csv.gz'];
const MEMBERSHIP_FILES = {
  GB1: 'en.1.json', GB2: 'en.2.json', ES1: 'es.1.json', IT1: 'it.1.json',
  DE1: 'de.1.json', FR1: 'fr.1.json', PT1: 'pt.1.json', NL1: 'nl.1.json',
};

mkdirSync(OPEN, { recursive: true });
mkdirSync(MEMBERSHIPS, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url, destination) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const temp = `${destination}.part`;
    rmSync(temp, { force: true });
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length) throw new Error('fichier vide');
      writeFileSync(temp, body);
      renameSync(temp, destination);
      return {
        url,
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        lastModified: response.headers.get('last-modified'),
        etag: response.headers.get('etag'),
      };
    } catch (error) {
      rmSync(temp, { force: true });
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1_500);
    }
  }
  throw new Error(`${url} : ${lastError?.message ?? 'échec inconnu'}`);
}

const manifest = {
  acquiredAt: new Date().toISOString(),
  sources: {
    legacy: { dataset: 'github.com/ewenme/transfers', files: {} },
    recent: { dataset: 'github.com/dcaribou/transfermarkt-datasets', files: {} },
    memberships: {
      dataset: 'github.com/openfootball/football.json',
      season: currentSeasonYear,
      files: {},
    },
  },
};

for (const file of LEGACY_FILES) {
  process.stdout.write(`  historique ${file.padEnd(24)}`);
  const info = await download(`${LEGACY_BASE}/${file}`, join(RAW, file));
  manifest.sources.legacy.files[file] = info;
  console.log(`${(info.bytes / 1e6).toFixed(1)} Mo`);
}

for (const file of OPEN_FILES) {
  process.stdout.write(`  maintenu   ${file.padEnd(24)}`);
  const info = await download(`${OPEN_BASE}/${file}`, join(OPEN, file));
  manifest.sources.recent.files[file] = info;
  console.log(`${(info.bytes / 1e6).toFixed(1)} Mo · ${info.lastModified ?? 'date inconnue'}`);
}

for (const [leagueId, file] of Object.entries(MEMBERSHIP_FILES)) {
  process.stdout.write(`  effectifs   ${leagueId.padEnd(24)}`);
  const info = await download(`${OPENFOOTBALL_BASE}/${file}`, join(MEMBERSHIPS, `${leagueId}_${currentSeasonYear}.json`));
  manifest.sources.memberships.files[leagueId] = info;
  console.log(`${(info.bytes / 1e6).toFixed(2)} Mo`);
}

writeFileSync(join(RAW, 'acquisition.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n✓ ${LEGACY_FILES.length + OPEN_FILES.length + Object.keys(MEMBERSHIP_FILES).length} fichiers acquis avec empreintes SHA-256.`);
