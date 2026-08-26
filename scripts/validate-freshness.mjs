import { readFile } from 'node:fs/promises';

const file = new URL('../public/data/freshness.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(data && typeof data === 'object', 'racine JSON absente');
assert(['pending', 'ready'].includes(data.meta?.status), 'meta.status doit valoir pending ou ready');
assert(data.meta?.provider === 'football-data.org', 'provider inattendu');
assert(Array.isArray(data.competitions), 'competitions doit être un tableau');
assert(Array.isArray(data.teams), 'teams doit être un tableau');
assert(Array.isArray(data.signals), 'signals doit être un tableau');
assert(['pending', 'ready'].includes(data.honours?.meta?.status), 'honours.meta.status invalide');
assert(Array.isArray(data.honours?.coverage), 'honours.coverage doit être un tableau');
assert(Array.isArray(data.honours?.titles), 'honours.titles doit être un tableau');

if (data.meta?.status === 'ready') {
  const required = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL', 'DED', 'CL'];
  const codes = new Set(data.competitions.map((competition) => competition.code));
  for (const code of required) assert(codes.has(code), `compétition manquante : ${code}`);
  assert(data.competitions.length === required.length, 'nombre de compétitions inattendu');
  assert(data.meta.competitionCount === data.competitions.length, 'competitionCount incohérent');
  assert(data.meta.teamCount === data.teams.length, 'teamCount incohérent');
  assert(data.meta.teamCount >= 100, 'moins de 100 équipes : réponse probablement incomplète');
  assert(data.meta.playerCount >= 1_500, 'moins de 1 500 joueurs : réponse probablement incomplète');
  assert(Number.isFinite(new Date(data.meta.fetchedAt).valueOf()), 'fetchedAt invalide');
  assert(new Date(data.meta.fetchedAt).valueOf() <= Date.now() + 300_000, 'fetchedAt est dans le futur');

  const teamIds = new Set();
  const uniquePlayers = new Set();
  for (const team of data.teams) {
    assert(Number.isInteger(team.id), 'identifiant équipe invalide');
    assert(!teamIds.has(team.id), `équipe dupliquée : ${team.id}`);
    teamIds.add(team.id);
    assert(typeof team.name === 'string' && team.name.length > 0, `nom équipe invalide : ${team.id}`);
    assert(Array.isArray(team.competitions) && team.competitions.length > 0, `compétitions équipe absentes : ${team.id}`);
    assert(Array.isArray(team.players), `effectif absent : ${team.id}`);
    const playerIds = new Set();
    for (const player of team.players || []) {
      assert(Number.isInteger(player.id), `identifiant joueur invalide pour ${team.name}`);
      assert(!playerIds.has(player.id), `joueur dupliqué dans ${team.name} : ${player.id}`);
      playerIds.add(player.id);
      uniquePlayers.add(player.id);
    }
  }
  assert(data.meta.playerCount === uniquePlayers.size, 'playerCount incohérent');
  assert(data.meta.signalCount === data.signals.length, 'signalCount incohérent');
}

if (data.honours?.meta?.status === 'ready') {
  const codes = new Set(data.honours.coverage.map((item) => item.code));
  for (const code of ['PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL', 'DED', 'CL']) {
    assert(codes.has(code), `couverture palmarès manquante : ${code}`);
  }
  assert(data.honours.meta.competitionCount === data.honours.coverage.length, 'competitionCount palmarès incohérent');
  assert(data.honours.meta.titleCount === data.honours.titles.length, 'titleCount incohérent');
  assert(data.honours.meta.titleCount >= 8, 'historique des titres trop court');
  assert(data.honours.meta.matchedTitleCount + data.honours.meta.unmatchedTitleCount + (data.honours.meta.outsideScopeTitleCount ?? 0) === data.honours.meta.titleCount, 'rattachement des titres incohérent');
  const titleKeys = new Set();
  for (const item of data.honours.coverage) assert(item.titleCount > 0, `aucun champion disponible pour ${item.code}`);
  assert(Number.isInteger(data.honours.meta.commonYearMin), 'commonYearMin absent');
  assert(Number.isInteger(data.honours.meta.commonYearMax), 'commonYearMax absent');
  assert(data.honours.meta.commonYearMin <= data.honours.meta.commonYearMax, 'période commune des titres invalide');
  if (data.honours.meta.catalogVersion) {
    assert(data.honours.meta.commonYearMin === 2000, 'le catalogue doit commencer en 2000');
    assert(data.honours.meta.commonYearMax >= 2024, 'le catalogue doit couvrir la saison 2024/25');
    assert(data.honours.meta.competitionCount === 29, 'le catalogue doit couvrir 29 compétitions');
    assert(data.honours.meta.titleCount === 674, 'le catalogue doit contenir 674 trophées attribués');
    assert(data.honours.meta.matchedTitleCount === 664, '664 trophées doivent être rattachés au périmètre Footato');
    assert(data.honours.meta.outsideScopeTitleCount === 10, '10 trophées européens ou mondiaux doivent être signalés hors périmètre');
    assert(data.honours.meta.unmatchedTitleCount === 0, 'tout titre du catalogue doit être rattaché');
    if (data.meta?.status === 'ready') assert(data.honours.meta.crossCheckedTitleCount > 0, 'aucun titre contre-vérifié par l’API');
  }
  for (const title of data.honours.titles) {
    const key = `${title.competitionCode}:${title.season}`;
    assert(!titleKeys.has(key), `titre dupliqué : ${key}`);
    titleKeys.add(key);
    assert(['league', 'domesticCup', 'leagueCup', 'championsLeague', 'europaLeague', 'conferenceLeague', 'domesticSupercup', 'uefaSupercup', 'world'].includes(title.category), `catégorie de trophée invalide : ${key}`);
    assert(Number.isInteger(title.season), `saison de titre invalide : ${key}`);
    assert(typeof title.winner?.name === 'string' && title.winner.name, `vainqueur absent : ${key}`);
    assert(title.winner.clubId == null || Number.isInteger(title.winner.clubId), `clubId de titre invalide : ${key}`);
    if (data.honours.meta.catalogVersion) {
      assert(/^https:\/\//.test(title.source), `source officielle absente : ${key}`);
      if (!['league'].includes(title.category)) assert(/^https:\/\//.test(title.verificationSource), `source de recoupement absente : ${key}`);
    }
  }
}

for (const signal of data.signals || []) {
  assert(['moved', 'added', 'removed'].includes(signal.kind), `signal.kind invalide : ${signal.kind}`);
  assert(Number.isInteger(signal.playerId), 'signal.playerId invalide');
  assert(Boolean(signal.fromTeam || signal.toTeam), `signal sans origine ni destination : ${signal.playerId}`);
  assert(Number.isFinite(new Date(signal.firstDetectedAt).valueOf()), `firstDetectedAt invalide : ${signal.playerId}`);
  assert(Number.isFinite(new Date(signal.lastSeenAt).valueOf()), `lastSeenAt invalide : ${signal.playerId}`);
}

if (failures.length) {
  console.error(`Échec validation fraîcheur (${failures.length}) :`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Fraîcheur valide : statut ${data.meta.status}, ${data.meta.teamCount} équipes, ${data.signals.length} signal(aux).`);
