export const COMPETITIONS = [
  { code: 'PL', label: 'Premier League', leagueId: 'GB1', kind: 'domestic' },
  { code: 'PD', label: 'La Liga', leagueId: 'ES1', kind: 'domestic' },
  { code: 'SA', label: 'Serie A', leagueId: 'IT1', kind: 'domestic' },
  { code: 'BL1', label: 'Bundesliga', leagueId: 'DE1', kind: 'domestic' },
  { code: 'FL1', label: 'Ligue 1', leagueId: 'FR1', kind: 'domestic' },
  { code: 'PPL', label: 'Primeira Liga', leagueId: 'PT1', kind: 'domestic' },
  { code: 'DED', label: 'Eredivisie', leagueId: 'NL1', kind: 'domestic' },
  { code: 'CL', label: 'Ligue des champions', leagueId: null, kind: 'continental' },
];

const HONOUR_CLUB_ALIASES = new Map(Object.entries({
  'FC Internazionale Milano': 'Inter Milan',
  'FC Bayern München': 'Bayern Munich',
  'Olympique de Marseille': 'Olympique Marseille',
  'Olympique Lyonnais': 'Olympique Lyon',
  'Sport Lisboa e Benfica': 'SL Benfica',
  'Sporting Clube de Portugal': 'Sporting CP',
  'Futebol Clube do Porto': 'FC Porto',
  'AFC Ajax': 'Ajax Amsterdam',
  'PSV': 'PSV Eindhoven',
  'Feyenoord': 'Feyenoord Rotterdam',
  'Club Atlético de Madrid': 'Atlético de Madrid',
  'Real Madrid CF': 'Real Madrid',
  'Manchester City FC': 'Manchester City',
  'Manchester United FC': 'Manchester United',
  'Blackburn Rovers FC': 'Blackburn Rovers',
  'Leicester City FC': 'Leicester City',
  'Paris Saint-Germain FC': 'Paris Saint-Germain',
  'AS Monaco FC': 'AS Monaco',
  'FC Girondins de Bordeaux': 'Girondins Bordeaux',
}));

const asIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};

const byId = (a, b) => a.id - b.id;

/** Merge domestic and Champions League responses into one canonical team snapshot. */
export function normaliseSnapshot(responses, fetchedAt = new Date().toISOString()) {
  const teams = new Map();
  const competitions = [];

  for (const { code, payload } of responses) {
    if (!payload || !Array.isArray(payload.teams)) {
      throw new Error(`Réponse football-data.org invalide pour ${code}`);
    }

    competitions.push({
      code,
      name: payload.competition?.name || COMPETITIONS.find((item) => item.code === code)?.label || code,
      seasonStart: payload.season?.startDate || null,
      teamCount: payload.teams.length,
    });

    for (const rawTeam of payload.teams) {
      if (!Number.isInteger(rawTeam.id) || !rawTeam.name) continue;
      let team = teams.get(rawTeam.id);
      if (!team) {
        team = {
          id: rawTeam.id,
          name: rawTeam.name,
          shortName: rawTeam.shortName || rawTeam.name,
          tla: rawTeam.tla || '',
          lastUpdated: asIso(rawTeam.lastUpdated),
          competitions: new Set(),
          players: new Map(),
          squadPriority: code === 'CL' ? 1 : 2,
        };
        teams.set(team.id, team);
      }
      team.competitions.add(code);
      const updated = asIso(rawTeam.lastUpdated);
      if (updated && (!team.lastUpdated || updated > team.lastUpdated)) team.lastUpdated = updated;

      const squadPriority = code === 'CL' ? 1 : 2;
      if (squadPriority >= team.squadPriority) {
        if (squadPriority > team.squadPriority) team.players.clear();
        team.squadPriority = squadPriority;
        for (const rawPlayer of Array.isArray(rawTeam.squad) ? rawTeam.squad : []) {
          if (!Number.isInteger(rawPlayer.id) || !rawPlayer.name) continue;
          team.players.set(rawPlayer.id, {
            id: rawPlayer.id,
            name: rawPlayer.name,
            position: rawPlayer.position || null,
            nationality: rawPlayer.nationality || null,
          });
        }
      }
    }
  }

  const canonicalTeams = [...teams.values()].map((team) => {
    const { squadPriority: _squadPriority, ...publicTeam } = team;
    return {
      ...publicTeam,
      competitions: [...team.competitions].sort(),
      players: [...team.players.values()].sort(byId),
    };
  }).sort(byId);

  const memberships = playerMemberships(canonicalTeams);
  const playerCount = new Set(canonicalTeams.flatMap((team) => team.players.map((player) => player.id))).size;
  const sourceUpdatedAt = canonicalTeams.reduce(
    (latest, team) => (team.lastUpdated && (!latest || team.lastUpdated > latest) ? team.lastUpdated : latest),
    null,
  );

  return {
    meta: {
      status: 'ready',
      provider: 'football-data.org',
      fetchedAt: asIso(fetchedAt),
      previousFetchedAt: null,
      sourceUpdatedAt,
      competitionCount: competitions.length,
      teamCount: canonicalTeams.length,
      playerCount,
      ambiguousPlayerCount: [...memberships.values()].filter((items) => items.length !== 1).length,
      newSignalCount: 0,
      signalCount: 0,
      isBaseline: true,
    },
    competitions: competitions.sort((a, b) => a.code.localeCompare(b.code)),
    teams: canonicalTeams,
    signals: [],
  };
}

function playerMemberships(teams) {
  const memberships = new Map();
  for (const team of teams || []) {
    for (const player of team.players || []) {
      const current = memberships.get(player.id) || [];
      current.push({ player, team: { id: team.id, name: team.name } });
      memberships.set(player.id, current);
    }
  }
  return memberships;
}

/** Only unique memberships are compared; ambiguous provider records never become transfer claims. */
export function diffSnapshots(previous, current, detectedAt = current.meta.fetchedAt) {
  if (previous?.meta?.status !== 'ready') return [];

  const before = playerMemberships(previous.teams);
  const after = playerMemberships(current.teams);
  const signals = [];
  const playerIds = new Set([...before.keys(), ...after.keys()]);

  for (const playerId of playerIds) {
    const oldMemberships = before.get(playerId) || [];
    const newMemberships = after.get(playerId) || [];
    if (oldMemberships.length > 1 || newMemberships.length > 1) continue;
    const oldItem = oldMemberships[0] || null;
    const newItem = newMemberships[0] || null;
    if (oldItem?.team.id === newItem?.team.id) continue;

    const kind = oldItem && newItem ? 'moved' : oldItem ? 'removed' : 'added';
    const player = newItem?.player || oldItem?.player;
    signals.push({
      kind,
      playerId,
      playerName: player.name,
      fromTeam: oldItem?.team || null,
      toTeam: newItem?.team || null,
      firstDetectedAt: detectedAt,
      lastSeenAt: detectedAt,
    });
  }

  return signals.sort((a, b) => a.playerName.localeCompare(b.playerName, 'fr'));
}

const signalKey = (signal) => [
  signal.kind,
  signal.playerId,
  signal.fromTeam?.id || 0,
  signal.toTeam?.id || 0,
].join(':');

export function mergeSignals(previousSignals, newSignals, now, retentionDays = 30) {
  const cutoff = new Date(new Date(now).valueOf() - retentionDays * 86_400_000).toISOString();
  const merged = new Map();

  for (const signal of previousSignals || []) {
    if (signal.lastSeenAt >= cutoff) merged.set(signalKey(signal), signal);
  }
  for (const signal of newSignals) {
    const key = signalKey(signal);
    const previous = merged.get(key);
    merged.set(key, {
      ...signal,
      firstDetectedAt: previous?.firstDetectedAt || signal.firstDetectedAt,
    });
  }
  return [...merged.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function finaliseSnapshot(current, previous) {
  const newSignals = diffSnapshots(previous, current);
  const signals = mergeSignals(previous?.signals, newSignals, current.meta.fetchedAt);
  return {
    ...current,
    meta: {
      ...current.meta,
      previousFetchedAt: previous?.meta?.status === 'ready' ? previous.meta.fetchedAt : null,
      newSignalCount: newSignals.length,
      signalCount: signals.length,
      isBaseline: previous?.meta?.status !== 'ready',
    },
    signals,
  };
}

const normaliseClubName = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/\([^)]*\)/g, ' ')
  .replace(/\b(fc|afc|cf|sc|ac|as|ss|club|football|calcio|futbol|futebol)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '');

/** Convert structured season winners into titles joined to Footato's stable club ids. */
export function normaliseHonours(responses, summary, fetchedAt = new Date().toISOString()) {
  const activeIds = new Set(summary.rows.map((row) => row[0]));
  const clubIndex = new Map();
  const register = (name, id) => {
    const key = normaliseClubName(name);
    if (!key) return;
    const ids = clubIndex.get(key) || new Set();
    ids.add(id);
    clubIndex.set(key, ids);
  };
  for (const id of activeIds) register(summary.clubs[id], id);

  const resolveClub = (providerName) => {
    const canonical = HONOUR_CLUB_ALIASES.get(providerName) || providerName;
    const ids = [...(clubIndex.get(normaliseClubName(canonical)) || [])];
    return ids.length === 1 ? ids[0] : null;
  };

  const titles = [];
  const coverage = [];
  const seen = new Set();
  for (const { code, payload } of responses) {
    if (!payload || !Array.isArray(payload.seasons)) {
      throw new Error(`Historique football-data.org invalide pour ${code}`);
    }
    const config = COMPETITIONS.find((item) => item.code === code);
    const seasons = [];
    for (const season of payload.seasons) {
      const year = Number.parseInt(String(season.startDate || '').slice(0, 4), 10);
      if (!Number.isInteger(year) || year < summary.meta.yearMin || year > summary.meta.yearMax || !season.winner?.name) continue;
      const key = `${code}:${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const clubId = resolveClub(season.winner.name);
      titles.push({
        competitionCode: code,
        competitionName: payload.name || config?.label || code,
        kind: config?.kind || 'domestic',
        season: year,
        winner: { providerId: season.winner.id ?? null, name: season.winner.name, clubId },
      });
      seasons.push({ year, matched: clubId != null });
    }
    coverage.push({
      code,
      name: payload.name || config?.label || code,
      yearMin: seasons.length ? Math.min(...seasons.map((item) => item.year)) : null,
      yearMax: seasons.length ? Math.max(...seasons.map((item) => item.year)) : null,
      titleCount: seasons.length,
      matchedTitleCount: seasons.filter((item) => item.matched).length,
    });
  }

  titles.sort((a, b) => a.season - b.season || a.competitionCode.localeCompare(b.competitionCode));
  const unmatched = titles.filter((title) => title.winner.clubId == null);
  const completeCoverage = coverage.filter((item) => item.yearMin != null && item.yearMax != null);
  return {
    meta: {
      status: 'ready',
      provider: 'football-data.org',
      fetchedAt: asIso(fetchedAt),
      competitionCount: responses.length,
      titleCount: titles.length,
      matchedTitleCount: titles.length - unmatched.length,
      unmatchedTitleCount: unmatched.length,
      yearMin: titles.length ? Math.min(...titles.map((title) => title.season)) : null,
      yearMax: titles.length ? Math.max(...titles.map((title) => title.season)) : null,
      commonYearMin: completeCoverage.length === responses.length ? Math.max(...completeCoverage.map((item) => item.yearMin)) : null,
      commonYearMax: completeCoverage.length === responses.length ? Math.min(...completeCoverage.map((item) => item.yearMax)) : null,
    },
    coverage: coverage.sort((a, b) => a.code.localeCompare(b.code)),
    titles,
  };
}
