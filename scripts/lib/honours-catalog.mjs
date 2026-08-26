import { COMPETITIONS } from './freshness.mjs';

export const HONOURS_CATALOG_VERSION = '2026-08-26.1';
export const HONOURS_YEAR_MIN = 2000;
export const HONOURS_YEAR_MAX = 2024;

// One value per season start year, from 2000/01 through 2024/25.
// A null value is intentional and must be documented in NO_CHAMPION.
const CATALOG = {
  PL: {
    source: 'https://www.premierleague.com/en/premier-league-explained',
    champions: [
      'Manchester United', 'Arsenal FC', 'Manchester United', 'Arsenal FC', 'Chelsea FC',
      'Chelsea FC', 'Manchester United', 'Manchester United', 'Manchester United', 'Chelsea FC',
      'Manchester United', 'Manchester City', 'Manchester United', 'Manchester City', 'Chelsea FC',
      'Leicester City', 'Chelsea FC', 'Manchester City', 'Manchester City', 'Liverpool FC',
      'Manchester City', 'Manchester City', 'Manchester City', 'Manchester City', 'Liverpool FC',
    ],
  },
  PD: {
    source: 'https://www.laliga.com/noticias/todos-los-campeones-de-la-historia-de-laliga',
    champions: [
      'Real Madrid', 'Valencia CF', 'Real Madrid', 'Valencia CF', 'FC Barcelona',
      'FC Barcelona', 'Real Madrid', 'Real Madrid', 'FC Barcelona', 'FC Barcelona',
      'FC Barcelona', 'Real Madrid', 'FC Barcelona', 'Atlético de Madrid', 'FC Barcelona',
      'FC Barcelona', 'Real Madrid', 'FC Barcelona', 'FC Barcelona', 'Real Madrid',
      'Atlético de Madrid', 'Real Madrid', 'FC Barcelona', 'Real Madrid', 'FC Barcelona',
    ],
  },
  SA: {
    source: 'https://www.legaseriea.it/serie-a/albo',
    champions: [
      'AS Roma', 'Juventus FC', 'Juventus FC', 'AC Milan', null,
      'Inter Milan', 'Inter Milan', 'Inter Milan', 'Inter Milan', 'Inter Milan',
      'AC Milan', 'Juventus FC', 'Juventus FC', 'Juventus FC', 'Juventus FC',
      'Juventus FC', 'Juventus FC', 'Juventus FC', 'Juventus FC', 'Juventus FC',
      'Inter Milan', 'AC Milan', 'SSC Napoli', 'Inter Milan', 'SSC Napoli',
    ],
  },
  BL1: {
    source: 'https://www.bundesliga.com/de/bundesliga/news/liste-deutscher-meister-bundesliga-koln-bayern-nurnberg-dortmund-bremen-kaiserslautern-23908',
    champions: [
      'Bayern Munich', 'Borussia Dortmund', 'Bayern Munich', 'SV Werder Bremen', 'Bayern Munich',
      'Bayern Munich', 'VfB Stuttgart', 'Bayern Munich', 'VfL Wolfsburg', 'Bayern Munich',
      'Borussia Dortmund', 'Borussia Dortmund', 'Bayern Munich', 'Bayern Munich', 'Bayern Munich',
      'Bayern Munich', 'Bayern Munich', 'Bayern Munich', 'Bayern Munich', 'Bayern Munich',
      'Bayern Munich', 'Bayern Munich', 'Bayern Munich', 'Bayer 04 Leverkusen', 'Bayern Munich',
    ],
  },
  FL1: {
    source: 'https://ligue1.com/fr/articles/l1_article_289-le-palmares-des-champions-de-ligue-1',
    champions: [
      'FC Nantes', 'Olympique Lyon', 'Olympique Lyon', 'Olympique Lyon', 'Olympique Lyon',
      'Olympique Lyon', 'Olympique Lyon', 'Olympique Lyon', 'FC Girondins Bordeaux', 'Olympique Marseille',
      'LOSC Lille', 'Montpellier HSC', 'Paris Saint-Germain', 'Paris Saint-Germain', 'Paris Saint-Germain',
      'Paris Saint-Germain', 'AS Monaco', 'Paris Saint-Germain', 'Paris Saint-Germain', 'Paris Saint-Germain',
      'LOSC Lille', 'Paris Saint-Germain', 'Paris Saint-Germain', 'Paris Saint-Germain', 'Paris Saint-Germain',
    ],
  },
  PPL: {
    source: 'https://www.ligaportugal.pt/pages/historia',
    champions: [
      'Boavista FC', 'Sporting CP', 'FC Porto', 'FC Porto', 'SL Benfica',
      'FC Porto', 'FC Porto', 'FC Porto', 'FC Porto', 'SL Benfica',
      'FC Porto', 'FC Porto', 'FC Porto', 'SL Benfica', 'SL Benfica',
      'SL Benfica', 'SL Benfica', 'FC Porto', 'SL Benfica', 'FC Porto',
      'Sporting CP', 'FC Porto', 'SL Benfica', 'Sporting CP', 'Sporting CP',
    ],
  },
  DED: {
    source: 'https://eredivisie.nl/nieuws/psv-voor-de-26e-keer-kampioen-van-nederland/',
    champions: [
      'PSV Eindhoven', 'Ajax Amsterdam', 'PSV Eindhoven', 'Ajax Amsterdam', 'PSV Eindhoven',
      'PSV Eindhoven', 'PSV Eindhoven', 'PSV Eindhoven', 'AZ Alkmaar', 'Twente Enschede FC',
      'Ajax Amsterdam', 'Ajax Amsterdam', 'Ajax Amsterdam', 'Ajax Amsterdam', 'PSV Eindhoven',
      'PSV Eindhoven', 'Feyenoord Rotterdam', 'PSV Eindhoven', 'Ajax Amsterdam', null,
      'Ajax Amsterdam', 'Ajax Amsterdam', 'Feyenoord Rotterdam', 'PSV Eindhoven', 'PSV Eindhoven',
    ],
  },
  CL: {
    source: 'https://www.uefa.com/uefachampionsleague/history/',
    champions: [
      'Bayern Munich', 'Real Madrid', 'AC Milan', 'FC Porto', 'Liverpool FC',
      'FC Barcelona', 'AC Milan', 'Manchester United', 'FC Barcelona', 'Inter Milan',
      'FC Barcelona', 'Chelsea FC', 'Bayern Munich', 'Real Madrid', 'FC Barcelona',
      'Real Madrid', 'Real Madrid', 'Real Madrid', 'Liverpool FC', 'Bayern Munich',
      'Chelsea FC', 'Real Madrid', 'Manchester City', 'Real Madrid', 'Paris Saint-Germain',
    ],
  },
};

const NO_CHAMPION = {
  'SA:2004': 'Titre révoqué à la suite de l’affaire Calciopoli ; aucun champion attribué.',
  'DED:2019': 'Saison interrompue par la pandémie de Covid-19 ; aucun champion attribué.',
};

function activeClubIndex(summary) {
  const activeIds = new Set(summary.rows.map((row) => row[0]));
  const index = new Map();
  for (const id of activeIds) {
    const name = summary.clubs[id];
    if (!name) continue;
    const ids = index.get(name) || [];
    ids.push(id);
    index.set(name, ids);
  }
  return index;
}

/** Build the comparable, versioned title catalogue and reject any API disagreement. */
export function buildHonoursCatalog(summary, apiHonours = null, fetchedAt = new Date().toISOString()) {
  const clubIndex = activeClubIndex(summary);
  const titles = [];
  const coverage = [];

  for (const competition of COMPETITIONS) {
    const item = CATALOG[competition.code];
    if (!item || item.champions.length !== HONOURS_YEAR_MAX - HONOURS_YEAR_MIN + 1) {
      throw new Error(`Catalogue palmarès incomplet pour ${competition.code}`);
    }
    const missingSeasons = [];
    let matchedTitleCount = 0;
    item.champions.forEach((clubName, offset) => {
      const season = HONOURS_YEAR_MIN + offset;
      if (clubName == null) {
        const reason = NO_CHAMPION[`${competition.code}:${season}`];
        if (!reason) throw new Error(`Saison sans champion non documentée : ${competition.code}:${season}`);
        missingSeasons.push({ season, reason });
        return;
      }
      const ids = clubIndex.get(clubName) || [];
      if (ids.length !== 1) throw new Error(`Club de palmarès introuvable ou ambigu : ${clubName}`);
      matchedTitleCount += 1;
      titles.push({
        competitionCode: competition.code,
        competitionName: competition.label,
        kind: competition.kind,
        season,
        source: item.source,
        winner: { providerId: null, name: clubName, clubId: ids[0] },
      });
    });
    coverage.push({
      code: competition.code,
      name: competition.label,
      source: item.source,
      yearMin: HONOURS_YEAR_MIN,
      yearMax: HONOURS_YEAR_MAX,
      titleCount: matchedTitleCount,
      matchedTitleCount,
      missingSeasons,
    });
  }

  const catalogByKey = new Map(titles.map((title) => [`${title.competitionCode}:${title.season}`, title]));
  let crossCheckedTitleCount = 0;
  const disagreements = [];
  for (const apiTitle of apiHonours?.titles || []) {
    const catalogTitle = catalogByKey.get(`${apiTitle.competitionCode}:${apiTitle.season}`);
    if (!catalogTitle || apiTitle.winner?.clubId == null) continue;
    crossCheckedTitleCount += 1;
    if (catalogTitle.winner.clubId !== apiTitle.winner.clubId) {
      disagreements.push(
        `${apiTitle.competitionCode}:${apiTitle.season} (${catalogTitle.winner.name} ≠ ${apiTitle.winner.name})`,
      );
    }
  }
  if (disagreements.length) {
    throw new Error(`Désaccord palmarès avec football-data.org : ${disagreements.join(', ')}`);
  }

  titles.sort((a, b) => a.season - b.season || a.competitionCode.localeCompare(b.competitionCode));
  return {
    meta: {
      status: 'ready',
      provider: 'Sources officielles des ligues et UEFA, contre-vérifiées par football-data.org',
      catalogVersion: HONOURS_CATALOG_VERSION,
      fetchedAt,
      competitionCount: coverage.length,
      titleCount: titles.length,
      matchedTitleCount: titles.length,
      unmatchedTitleCount: 0,
      crossCheckedTitleCount,
      yearMin: HONOURS_YEAR_MIN,
      yearMax: HONOURS_YEAR_MAX,
      commonYearMin: HONOURS_YEAR_MIN,
      commonYearMax: HONOURS_YEAR_MAX,
    },
    coverage: coverage.sort((a, b) => a.code.localeCompare(b.code)),
    titles,
  };
}

