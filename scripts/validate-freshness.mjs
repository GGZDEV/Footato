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
