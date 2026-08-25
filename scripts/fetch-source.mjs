/**
 * Downloads the raw Transfermarkt CSV exports into data/raw/.
 *
 * The source is ewenme/transfers, a scrape of Transfermarkt's club transfer pages
 * published as one CSV per league. Files are ~20 Mo in total and are not committed;
 * run this whenever you want to pick up an updated upstream snapshot.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'raw');
const BASE = 'https://raw.githubusercontent.com/ewenme/transfers/master/data';

const FILES = [
  'premier-league.csv', 'primera-division.csv', 'serie-a.csv', '1-bundesliga.csv',
  'ligue-1.csv', 'liga-nos.csv', 'eredivisie.csv', 'premier-liga.csv', 'championship.csv',
];

mkdirSync(RAW, { recursive: true });

let failed = 0;
for (const file of FILES) {
  process.stdout.write(`  ${file.padEnd(24)}`);
  try {
    const res = await fetch(`${BASE}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(RAW, file), body);
    console.log(`${(body.length / 1e6).toFixed(1)} Mo`);
  } catch (err) {
    failed++;
    console.log(`échec — ${err.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} fichier(s) non téléchargé(s).`);
  process.exit(1);
}
console.log(`\n✓ ${FILES.length} fichiers dans data/raw — enchaînez avec \`npm run data:build\`.`);
