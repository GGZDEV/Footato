/**
 * Normalises maintained Transfermarkt exports into Footato's club-perspective
 * movement schema.
 *
 * Critical rule: a club's competition is resolved from games for that exact
 * season. clubs.domestic_competition_id is deliberately not used because it is
 * not season-specific and incorrectly assigns relegated clubs to a top league.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = join(ROOT, 'data', 'raw', 'transfermarkt-datasets');
const OUT = join(ROOT, 'data', 'raw', 'recent');
const OPENFOOTBALL = join(ROOT, 'data', 'raw', 'openfootball');

const COMPETITIONS = {
  GB1: { file: 'premier-league.csv', id: 'GB1' },
  ES1: { file: 'primera-division.csv', id: 'ES1' },
  IT1: { file: 'serie-a.csv', id: 'IT1' },
  L1: { file: '1-bundesliga.csv', id: 'DE1' },
  FR1: { file: 'ligue-1.csv', id: 'FR1' },
  PO1: { file: 'liga-nos.csv', id: 'PT1' },
  NL1: { file: 'eredivisie.csv', id: 'NL1' },
  RU1: { file: 'premier-liga.csv', id: 'RU1' },
  // The maintained dataset currently has no GB2 games. The entry is kept so
  // a future upstream extension starts working without changing the importer.
  GB2: { file: 'championship.csv', id: 'GB2' },
};

// The maintained clubs table increasingly uses legal entity names while the
// historical transfer pages use public football names. Keep one continuous
// club identity in the UI. This list is intentionally explicit and auditable:
// automatic fuzzy matching could merge two genuinely different clubs.
const CLUB_ALIASES = new Map(Object.entries({
  '1.FC Köln': '1. FC Köln',
  'AO FK Zenit Sankt-Peterburg': 'Zenit St. Petersburg',
  'Associazione Sportiva Roma': 'AS Roma',
  'Bologna Football Club 1909': 'Bologna FC 1909',
  'Como 1907': 'Como Calcio',
  'Bolton Wanderers FC': 'Bolton Wanderers',
  'Bristol City FC': 'Bristol City',
  'Derby County FC': 'Derby County',
  'FC Khimki (-2025)': 'FK Khimki',
  'FC Orenburg': 'FK Orenburg',
  'FC Rubin Kazan': 'Rubin Kazan',
  'FC Twente Enschede': 'Twente Enschede FC',
  'FK Baltika': 'Baltika Kaliningrad',
  'FK Dinamo Moskva': 'Dinamo Moscow',
  'FK Nizhny Novgorod': 'FC Pari Nizhniy Novgorod',
  'FK Sochi': 'FC Sochi',
  'FK Spartak Moskva': 'Spartak Moscow',
  'Fortuna Sittardia Combinatie': 'Fortuna Sittard',
  'Le Havre AC': 'AC Le Havre',
  'PFK CSKA Moskva': 'CSKA Moscow',
  'Preston North End FC': 'Preston North End',
  'PFK Krylya Sovetov Samara': 'Krylya Sovetov Samara',
  'RFK Akhmat Grozny': 'Akhmat Grozny',
  'Società Sportiva Lazio S.p.A.': 'SS Lazio',
  'Футбольный клуб "Локомотив" Москва': 'Lokomotiv Moscow',
}));

// OpenFootball deliberately uses long official names, whereas Transfermarkt's
// exports mix short names and names of youth/reserve sides. These verified ids
// make the cross-source join deterministic and reviewable. Unlisted names must
// still match uniquely after normalisation.
const MEMBERSHIP_CLUB_IDS = new Map(Object.entries({
  'Arsenal FC': '11',
  'Coventry City FC': '990',
  'Liverpool FC': '31',
  'Rayo Vallecano de Madrid': '367',
  'Real Racing Club de Santander': '630',
  'RCD Espanyol de Barcelona': '714',
  'RC Deportivo La Coruña': '897',
  'Real Sociedad de Fútbol': '681',
  'Athletic Club': '621',
  'RC Celta de Vigo': '940',
  'FC Barcelona': '131',
  'FC Internazionale Milano': '46',
  'Juventus FC': '506',
  'FC Bayern München': '27',
  'SV 07 Elversberg': '64',
  'Olympique de Marseille': '244',
  'Racing Club de Lens': '826',
  'ES Troyes AC': '1095',
  'Olympique Lyonnais': '1041',
  'Lille OSC': '1082',
  'Stade Rennais FC 1901': '273',
  'CF Estrela da Amadora': '2431',
  'Sporting Clube de Portugal': '336',
  'Sporting Clube de Braga': '1075',
  'Sport Lisboa e Benfica': '294',
  'Académico de Viseu FC': '7788',
  'SBV Excelsior': '798',
  'Telstar 1963': '1434',
  'Go Ahead Eagles': '1435',
  'AZ': '1090',
  "FC Twente '65": '317',
  'Blackburn Rovers FC': '164',
  'Bolton Wanderers FC': '355',
  'Preston North End FC': '466',
  'Charlton Athletic FC': '358',
  'Derby County FC': '22',
  'Birmingham City FC': '337',
}));

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SOURCE = arg('from', DEFAULT_SOURCE);
const SINCE = Number.parseInt(arg('since', '2023'), 10);
const CUTOFF = new Date(`${arg('cutoff', new Date().toISOString().slice(0, 10))}T23:59:59Z`);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function sourcePath(name) {
  const gzip = join(SOURCE, `${name}.gz`);
  const plain = join(SOURCE, name);
  if (existsSync(gzip)) return gzip;
  if (existsSync(plain)) return plain;
  throw new Error(`Fichier source manquant : ${gzip} (ou ${plain})`);
}

function readTable(name) {
  const path = sourcePath(name);
  const bytes = readFileSync(path);
  const text = path.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length >= header.length).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i]])),
  );
}

function seasonYear(season) {
  const match = String(season ?? '').match(/^(\d{2,4})/);
  if (!match) return NaN;
  const n = Number.parseInt(match[1], 10);
  return match[1].length === 2 ? (n >= 70 ? 1900 + n : 2000 + n) : n;
}

function transferWindow(year, date) {
  // A transfer in the season's first calendar year belongs to summer; January
  // through the end of the season belongs to winter. This avoids classifying
  // October/November registrations as winter merely because they are after Sep.
  return date.getUTCFullYear() <= year ? 'Summer' : 'Winter';
}

function feeLabels(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.toLowerCase() === 'na' || text.toLowerCase() === 'null') {
    return { fee: '?', cleaned: 'NA' };
  }
  const euros = Number.parseFloat(text);
  if (!Number.isFinite(euros)) return { fee: '?', cleaned: 'NA' };
  if (euros <= 0) return { fee: 'free transfer or loan', cleaned: '0' };
  const millions = euros / 1_000_000;
  return {
    fee: millions >= 1 ? `€${millions.toFixed(2)}m` : `€${Math.round(euros / 1000)}Th.`,
    cleaned: String(Number(millions.toFixed(3))),
  };
}

function normaliseClubName(value) {
  const ignored = new Set([
    'fc', 'afc', 'cf', 'sc', 'ac', 'as', 'ss', 'fk', 'pfk', 'rfk', 'ao',
    'club', 'football', 'futbol', 'futebol', 'calcio', 'spa', '1909',
  ]);
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token && !ignored.has(token)).join('');
}

const competitions = new Map(readTable('competitions.csv').map((c) => [c.competition_id, c]));
const clubs = new Map(readTable('clubs.csv').map((c) => [c.club_id, c]));
const games = readTable('games.csv');
const transfers = readTable('transfers.csv');

let acquisition = null;
const acquisitionPath = join(ROOT, 'data', 'raw', 'acquisition.json');
if (existsSync(acquisitionPath)) acquisition = JSON.parse(readFileSync(acquisitionPath, 'utf8'));

// season|club -> source competition id
const memberships = new Map();
const membershipNames = new Map();
for (const game of games) {
  if (!COMPETITIONS[game.competition_id]) continue;
  const year = Number.parseInt(game.season, 10);
  if (!Number.isFinite(year)) continue;
  for (const clubId of [game.home_club_id, game.away_club_id]) {
    const key = `${year}|${clubId}`;
    const previous = memberships.get(key);
    if (previous && previous !== game.competition_id) {
      throw new Error(`Club ${clubId} présent dans ${previous} et ${game.competition_id} en ${year}`);
    }
    memberships.set(key, game.competition_id);
  }
}

// The maintained games export necessarily lags the season currently starting.
// OpenFootball supplies the current fixture lists; their team names are joined
// to stable Transfermarkt club ids. A whole league is accepted only when every
// listed team resolves uniquely, so a partial or fuzzy join can never leak into
// the public data.
const candidateNames = new Map();
const candidateIndex = new Map();
const registerCandidate = (clubId, name) => {
  if (!clubId || !name || clubId === '0') return;
  if (!candidateNames.has(clubId)) candidateNames.set(clubId, new Set());
  candidateNames.get(clubId).add(name);
  const key = normaliseClubName(name);
  if (!key) return;
  if (!candidateIndex.has(key)) candidateIndex.set(key, new Set());
  candidateIndex.get(key).add(clubId);
};
for (const [clubId, club] of clubs) registerCandidate(clubId, club.name);
for (const transfer of transfers) {
  registerCandidate(transfer.from_club_id, transfer.from_club_name);
  registerCandidate(transfer.to_club_id, transfer.to_club_name);
}

// Fixture lists are read for every season the acquisition step downloaded, not
// only the current one: the games export lags on some competitions (the English
// Championship has none after 2022), which silently dropped their transfers.
const membershipSeasons = Array.isArray(acquisition?.sources?.memberships?.seasons)
  ? acquisition.sources.memberships.seasons.map(Number).filter(Number.isFinite)
  : [Number.parseInt(acquisition?.sources?.memberships?.season, 10)].filter(Number.isFinite);

const membershipAudit = [];
const membershipRefused = [];
let membershipConflicts = 0;

for (const season of membershipSeasons) {
  for (const [sourceCompetitionId, target] of Object.entries(COMPETITIONS)) {
    const path = join(OPENFOOTBALL, `${target.id}_${season}.json`);
    if (!existsSync(path)) continue;
    const schedule = JSON.parse(readFileSync(path, 'utf8'));
    const teamNames = [...new Set((schedule.matches ?? []).flatMap((match) => [match.team1, match.team2]).filter(Boolean))];
    const resolved = [];
    const unresolved = [];
    for (const teamName of teamNames) {
      const overrideId = MEMBERSHIP_CLUB_IDS.get(teamName);
      const ids = overrideId && candidateNames.has(overrideId)
        ? [overrideId]
        : [...(candidateIndex.get(normaliseClubName(teamName)) ?? [])];
      if (ids.length === 1) resolved.push({ teamName, clubId: ids[0] });
      else unresolved.push({ teamName, candidateIds: ids });
    }
    const uniqueIds = new Set(resolved.map((team) => team.clubId));
    const complete = teamNames.length >= 14 && unresolved.length === 0 && uniqueIds.size === teamNames.length;

    // Only accepted compositions are audited; a partial join must never leak
    // into the public data, so it is recorded as a refusal instead.
    if (!complete) {
      membershipRefused.push({ leagueId: target.id, season, teamCount: teamNames.length, unresolved });
      continue;
    }
    membershipAudit.push({
      leagueId: target.id,
      season,
      teamCount: teamNames.length,
      resolvedCount: resolved.length,
      complete,
      unresolved,
    });

    for (const { teamName, clubId } of resolved) {
      const key = `${season}|${clubId}`;
      const previous = memberships.get(key);
      // The games export carries Transfermarkt's own club ids, so it wins any
      // disagreement with these name-joined lists; they only fill its gaps.
      if (previous) {
        if (previous !== sourceCompetitionId) membershipConflicts++;
        continue;
      }
      memberships.set(key, sourceCompetitionId);
      membershipNames.set(key, teamName);
    }
  }
}

const HEADER = [
  'club_name', 'player_name', 'age', 'position', 'club_involved_name', 'fee',
  'transfer_movement', 'transfer_period', 'fee_cleaned', 'league_name', 'year',
  'season', 'country', 'source', 'source_id', 'transfer_date',
  'club_source_id', 'counterpart_source_id',
].join(',');
const files = new Map(Object.values(COMPETITIONS).map((c) => [c.file, []]));
const q = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const seen = new Set();
const coveredYears = new Set();
let kept = 0, skippedOld = 0, skippedFuture = 0, skippedNoMembership = 0;
let skippedBadDate = 0, duplicates = 0;

for (const transfer of transfers) {
  const year = seasonYear(transfer.transfer_season);
  if (!Number.isFinite(year)) continue;
  if (year < SINCE) { skippedOld++; continue; }

  const date = new Date(`${transfer.transfer_date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) { skippedBadDate++; continue; }
  if (date > CUTOFF) { skippedFuture++; continue; }

  // Reject obviously inconsistent season/date pairs. The generous range allows
  // pre-agreements and end-of-loan records near season boundaries.
  const earliest = new Date(Date.UTC(year, 3, 1));
  const latest = new Date(Date.UTC(year + 1, 7, 31));
  if (date < earliest || date > latest) { skippedBadDate++; continue; }

  const period = transferWindow(year, date);
  const { fee, cleaned } = feeLabels(transfer.transfer_fee);
  const sourceId = [transfer.player_id, transfer.transfer_date, transfer.from_club_id, transfer.to_club_id].join(':');

  for (const side of [
    { clubId: transfer.from_club_id, otherId: transfer.to_club_id, movement: 'out', otherName: transfer.to_club_name },
    { clubId: transfer.to_club_id, otherId: transfer.from_club_id, movement: 'in', otherName: transfer.from_club_name },
  ]) {
    const sourceCompetitionId = memberships.get(`${year}|${side.clubId}`);
    const target = COMPETITIONS[sourceCompetitionId];
    if (!target) { skippedNoMembership++; continue; }

    const membershipKey = `${year}|${side.clubId}`;
    const club = clubs.get(side.clubId);
    const rawClubName = club?.name ?? membershipNames.get(membershipKey);
    if (!rawClubName) { skippedNoMembership++; continue; }
    const competition = competitions.get(sourceCompetitionId);
    const dedupeKey = `${sourceId}:${side.movement}:${sourceCompetitionId}`;
    if (seen.has(dedupeKey)) { duplicates++; continue; }
    seen.add(dedupeKey);

    const clubName = CLUB_ALIASES.get(rawClubName) ?? rawClubName;
    const otherClubName = clubs.get(side.otherId)?.name ?? side.otherName;
    const counterpartName = CLUB_ALIASES.get(otherClubName) ?? otherClubName;
    files.get(target.file).push([
      clubName, transfer.player_name, '', '', counterpartName,
      fee, side.movement, period, cleaned,
      competition?.name ?? sourceCompetitionId, String(year), `${year}/${year + 1}`,
      competition?.country_name ?? '', 'dcaribou/transfermarkt-datasets', sourceId,
      transfer.transfer_date, side.clubId, side.otherId,
    ].map(q).join(','));
    coveredYears.add(year);
    kept++;
  }
}

mkdirSync(OUT, { recursive: true });
for (const { file } of Object.values(COMPETITIONS)) {
  const rows = files.get(file);
  writeFileSync(join(OUT, file), `${HEADER}\n${rows.join('\n')}${rows.length ? '\n' : ''}`);
  console.log(`  ${file.padEnd(24)} ${rows.length} mouvements`);
}

const sourceFiles = acquisition?.sources?.recent?.files ?? {};
const modified = Object.values(sourceFiles).map((f) => f.lastModified).filter(Boolean).map((d) => new Date(d));
const sourceUpdatedAt = modified.length ? new Date(Math.min(...modified)).toISOString() : null;
const years = [...coveredYears].sort((a, b) => a - b);
const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'github.com/dcaribou/transfermarkt-datasets',
  sourceUpdatedAt,
  since: SINCE,
  yearMin: years[0] ?? null,
  yearMax: years.at(-1) ?? null,
  movementCount: kept,
  memberships: {
    source: 'github.com/openfootball/football.json',
    seasons: membershipSeasons,
    leagues: membershipAudit,
    refused: membershipRefused,
    conflicts: membershipConflicts,
  },
  quality: { duplicatesRemoved: duplicates, skippedFuture, skippedBadDate, skippedNoMembership },
};
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\n✓ ${kept} mouvements récents normalisés · saisons ${manifest.yearMin ?? '—'}-${manifest.yearMax ?? '—'}.`);
console.log(`  exclus : ${skippedFuture} futurs, ${skippedBadDate} dates incohérentes, ${skippedNoMembership} côtés sans championnat saisonnier.`);
const bySeason = new Map();
for (const audit of membershipAudit) {
  if (!bySeason.has(audit.season)) bySeason.set(audit.season, []);
  bySeason.get(audit.season).push(audit.leagueId);
}
for (const season of [...bySeason.keys()].sort((a, b) => a - b)) {
  console.log(`  compositions ${season}/${season + 1} : ${bySeason.get(season).join(' ')}`);
}
for (const refused of membershipRefused) {
  const why = refused.unresolved.map((item) => item.teamName).join(', ') || 'doublon de club';
  console.warn(`! composition ${refused.leagueId} ${refused.season}/${refused.season + 1} refusée (${refused.teamCount} équipes) : ${why}`);
}
if (membershipConflicts) {
  console.log(`  ${membershipConflicts} attributions déjà fournies par l'export des matchs, conservées telles quelles.`);
}
if (!files.get('championship.csv').length) {
  console.warn('! Championship récent indisponible dans cette source : historique conservé, aucune attribution inventée.');
}
