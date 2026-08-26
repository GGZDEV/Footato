export const HONOURS_CATALOG_VERSION = '2026-08-26.2';
export const HONOURS_YEAR_MIN = 2000;
export const HONOURS_YEAR_MAX = 2024;

const list = (value) => value.split('|').map((item) => item.trim()).map((item) => item === '—' ? null : item);

const CLUB_ALIASES = new Map(Object.entries({
  Arsenal: 'Arsenal FC', Chelsea: 'Chelsea FC', Liverpool: 'Liverpool FC',
  Middlesbrough: 'Middlesbrough FC', Portsmouth: 'Portsmouth FC',
  Barcelona: 'FC Barcelona', Sevilla: 'Sevilla FC', Valencia: 'Valencia CF',
  'Atlético Madrid': 'Atlético de Madrid', Villarreal: 'Villarreal CF', Zaragoza: 'Real Zaragoza',
  'Deportivo La Coruña': 'Deportivo de La Coruña', Mallorca: 'RCD Mallorca',
  Espanyol: 'RCD Espanyol Barcelona', 'Real Betis': 'Real Betis Balompié',
  Fiorentina: 'ACF Fiorentina', Roma: 'AS Roma', Lazio: 'SS Lazio', Napoli: 'SSC Napoli', Atalanta: 'Atalanta BC',
  Bologna: 'Bologna FC 1909', Parma: 'Parma FC', Milan: 'AC Milan',
  'Schalke 04': 'FC Schalke 04', 'Werder Bremen': 'SV Werder Bremen',
  'Bayer Leverkusen': 'Bayer 04 Leverkusen', '1. FC Nürnberg': '1.FC Nuremberg',
  Strasbourg: 'RC Strasbourg Alsace', Lorient: 'FC Lorient', Auxerre: 'AJ Auxerre',
  Rennes: 'Stade Rennais FC', Nantes: 'FC Nantes', Toulouse: 'FC Toulouse', Guingamp: 'EA Guingamp',
  Bordeaux: 'FC Girondins Bordeaux', Sochaux: 'FC Sochaux-Montbéliard',
  Lyon: 'Olympique Lyon', Marseille: 'Olympique Marseille', Monaco: 'AS Monaco',
  Lille: 'LOSC Lille', 'Paris SG': 'Paris Saint-Germain', 'AS Nancy Lorraine': 'AS Nancy-Lorraine',
  Porto: 'FC Porto', Benfica: 'SL Benfica', Braga: 'SC Braga',
  'Vitória de Setúbal': 'Vitória Setúbal FC', 'Vitória de Guimarães': 'Vitória Guimarães SC',
  Académica: 'Académica Coimbra', 'Desportivo das Aves': 'Desportivo Aves (- 2020)',
  Ajax: 'Ajax Amsterdam', PSV: 'PSV Eindhoven', Twente: 'Twente Enschede FC',
  Utrecht: 'FC Utrecht', AZ: 'AZ Alkmaar', Groningen: 'FC Groningen',
  Vitesse: 'Vitesse Arnhem', Heerenveen: 'SC Heerenveen', Feyenoord: 'Feyenoord Rotterdam',
}));

// Winners from UEFA/FIFA competitions whose domestic league is outside Footato's seven-country scope.
const OUTSIDE_SCOPE_CLUBS = new Set([
  'Galatasaray', 'CSKA Moscow', 'Zenit Saint Petersburg', 'Shakhtar Donetsk', 'Olympiacos',
  'Corinthians', 'São Paulo', 'Internacional',
]);

const competition = (code, name, category, source, winners, verificationSource) => ({
  code, name,
  category: code === 'USC' ? 'uefaSupercup' : category === 'supercup' ? 'domesticSupercup' : category,
  source, verificationSource, winners,
});

// One value per season start year, from 2000/01 through 2024/25. A null is intentional:
// it represents an edition not held or abandoned and must be documented below.
const CATALOG = [
  competition('PL', 'Premier League', 'league', 'https://www.premierleague.com/en/premier-league-explained', list('Manchester United|Arsenal|Manchester United|Arsenal|Chelsea|Chelsea|Manchester United|Manchester United|Manchester United|Chelsea|Manchester United|Manchester City|Manchester United|Manchester City|Chelsea|Leicester City|Chelsea|Manchester City|Manchester City|Liverpool|Manchester City|Manchester City|Manchester City|Manchester City|Liverpool')),
  competition('PD', 'LaLiga', 'league', 'https://www.laliga.com/noticias/todos-los-campeones-de-la-historia-de-laliga', list('Real Madrid|Valencia|Real Madrid|Valencia|Barcelona|Barcelona|Real Madrid|Real Madrid|Barcelona|Barcelona|Barcelona|Real Madrid|Barcelona|Atlético Madrid|Barcelona|Barcelona|Real Madrid|Barcelona|Barcelona|Real Madrid|Atlético Madrid|Real Madrid|Barcelona|Real Madrid|Barcelona')),
  competition('SA', 'Serie A', 'league', 'https://www.legaseriea.it/serie-a/albo', list('Roma|Juventus FC|Juventus FC|Milan|—|Inter Milan|Inter Milan|Inter Milan|Inter Milan|Inter Milan|Milan|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Inter Milan|Milan|Napoli|Inter Milan|Napoli')),
  competition('BL1', 'Bundesliga', 'league', 'https://www.bundesliga.com/de/bundesliga/news/liste-deutscher-meister-bundesliga-koln-bayern-nurnberg-dortmund-bremen-kaiserslautern-23908', list('Bayern Munich|Borussia Dortmund|Bayern Munich|Werder Bremen|Bayern Munich|Bayern Munich|VfB Stuttgart|Bayern Munich|VfL Wolfsburg|Bayern Munich|Borussia Dortmund|Borussia Dortmund|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayern Munich|Bayer Leverkusen|Bayern Munich')),
  competition('FL1', 'Ligue 1', 'league', 'https://ligue1.com/fr/articles/l1_article_289-le-palmares-des-champions-de-ligue-1', list('Nantes|Lyon|Lyon|Lyon|Lyon|Lyon|Lyon|Lyon|Bordeaux|Marseille|Lille|Montpellier HSC|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Monaco|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Lille|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain')),
  competition('PPL', 'Liga Portugal', 'league', 'https://www.ligaportugal.pt/pages/historia', list('Boavista FC|Sporting CP|Porto|Porto|Benfica|Porto|Porto|Porto|Porto|Benfica|Porto|Porto|Porto|Benfica|Benfica|Benfica|Benfica|Porto|Benfica|Porto|Sporting CP|Porto|Benfica|Sporting CP|Sporting CP')),
  competition('DED', 'Eredivisie', 'league', 'https://eredivisie.nl/nieuws/psv-voor-de-26e-keer-kampioen-van-nederland/', list('PSV Eindhoven|Ajax|PSV Eindhoven|Ajax|PSV Eindhoven|PSV Eindhoven|PSV Eindhoven|PSV Eindhoven|AZ|Twente|Ajax|Ajax|Ajax|Ajax|PSV Eindhoven|PSV Eindhoven|Feyenoord|PSV Eindhoven|Ajax|—|Ajax|Ajax|Feyenoord|PSV Eindhoven|PSV Eindhoven')),

  competition('FAC', 'FA Cup', 'domesticCup', 'https://www.thefa.com/competitions/thefacup', list('Liverpool|Arsenal|Arsenal|Manchester United|Arsenal|Liverpool|Chelsea|Portsmouth|Chelsea|Chelsea|Manchester City|Chelsea|Wigan Athletic|Arsenal|Arsenal|Manchester United|Arsenal|Chelsea|Manchester City|Arsenal|Leicester City|Liverpool|Manchester City|Manchester United|Crystal Palace'), 'https://en.wikipedia.org/wiki/List_of_FA_Cup_finals'),
  competition('CDR', 'Copa del Rey', 'domesticCup', 'https://rfef.es/es/competiciones/copa-del-rey', list('Zaragoza|Deportivo La Coruña|Mallorca|Zaragoza|Real Betis|Espanyol|Sevilla|Valencia|Barcelona|Sevilla|Real Madrid|Barcelona|Atlético Madrid|Real Madrid|Barcelona|Barcelona|Barcelona|Barcelona|Valencia|Real Sociedad|Barcelona|Real Betis|Real Madrid|Athletic Bilbao|Barcelona'), 'https://en.wikipedia.org/wiki/List_of_Copa_del_Rey_finals'),
  competition('CIT', 'Coppa Italia', 'domesticCup', 'https://www.legaseriea.it/en/coppa-italia', list('Fiorentina|Parma|Milan|Lazio|Inter Milan|Inter Milan|Roma|Roma|Lazio|Inter Milan|Inter Milan|Napoli|Lazio|Napoli|Juventus FC|Juventus FC|Juventus FC|Juventus FC|Lazio|Napoli|Juventus FC|Inter Milan|Inter Milan|Juventus FC|Bologna'), 'https://en.wikipedia.org/wiki/List_of_Coppa_Italia_finals'),
  competition('DFB', 'DFB-Pokal', 'domesticCup', 'https://www.dfb.de/maenner/wettbewerbe/dfb-pokal', list('Schalke 04|Schalke 04|Bayern Munich|Werder Bremen|Bayern Munich|Bayern Munich|1. FC Nürnberg|Bayern Munich|Werder Bremen|Bayern Munich|Schalke 04|Borussia Dortmund|Bayern Munich|Bayern Munich|VfL Wolfsburg|Bayern Munich|Borussia Dortmund|Eintracht Frankfurt|Bayern Munich|Bayern Munich|Borussia Dortmund|RB Leipzig|RB Leipzig|Bayer Leverkusen|VfB Stuttgart'), 'https://en.wikipedia.org/wiki/List_of_DFB-Pokal_finals'),
  competition('CDF', 'Coupe de France', 'domesticCup', 'https://www.fff.fr/competition/engagement/407336-coupe-de-france/phase/1/index.html', list('Strasbourg|Lorient|Auxerre|Paris Saint-Germain|Auxerre|Paris Saint-Germain|Sochaux|Lyon|Guingamp|Paris Saint-Germain|Lille|Lyon|Bordeaux|Guingamp|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Rennes|Paris Saint-Germain|Paris Saint-Germain|Nantes|Toulouse|Paris Saint-Germain|Paris Saint-Germain'), 'https://en.wikipedia.org/wiki/List_of_Coupe_de_France_finals'),
  competition('TP', 'Taça de Portugal', 'domesticCup', 'https://www.fpf.pt/pt/Competi%C3%A7%C3%B5es/Futebol-Masculino/Ta%C3%A7a-de-Portugal-Placard', list('Porto|Sporting CP|Porto|Benfica|Vitória de Setúbal|Porto|Sporting CP|Sporting CP|Porto|Porto|Porto|Académica|Vitória de Guimarães|Benfica|Sporting CP|Braga|Benfica|Desportivo das Aves|Sporting CP|Porto|Braga|Porto|Porto|Porto|Sporting CP'), 'https://en.wikipedia.org/wiki/Ta%C3%A7a_de_Portugal'),
  competition('KNVB', 'KNVB Beker', 'domesticCup', 'https://www.totoknvbbeker.nl/', list('Twente|Ajax|Utrecht|Utrecht|PSV|Ajax|Ajax|Feyenoord|Heerenveen|Ajax|Twente|PSV|AZ|PEC Zwolle|Groningen|Feyenoord|Vitesse|Feyenoord|Ajax|—|Ajax|PSV|PSV|Feyenoord|Go Ahead Eagles'), 'https://en.wikipedia.org/wiki/KNVB_Cup'),

  competition('EFL', 'EFL Cup', 'leagueCup', 'https://www.efl.com/competitions/carabao-cup/', list('Liverpool|Blackburn Rovers|Liverpool|Middlesbrough|Chelsea|Manchester United|Chelsea|Tottenham Hotspur|Manchester United|Manchester United|Birmingham City|Liverpool|Swansea City|Manchester City|Chelsea|Manchester City|Manchester United|Manchester City|Manchester City|Manchester City|Manchester City|Liverpool|Manchester United|Liverpool|Newcastle United'), 'https://en.wikipedia.org/wiki/List_of_EFL_Cup_finals'),
  competition('CDL', 'Coupe de la Ligue', 'leagueCup', 'https://www.ligue1.fr/Articles/Actu/2020/07/29/le-palmares-de-la-coupe-de-la-ligue', list('Lyon|Bordeaux|Monaco|Sochaux|Strasbourg|AS Nancy Lorraine|Bordeaux|Paris Saint-Germain|Bordeaux|Marseille|Marseille|Marseille|AS Saint-Étienne|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Strasbourg|Paris Saint-Germain|—|—|—|—|—'), 'https://en.wikipedia.org/wiki/Coupe_de_la_Ligue'),
  competition('TDL', 'Taça da Liga', 'leagueCup', 'https://www.ligaportugal.pt/competicao/allianz-cup', list('—|—|—|—|—|—|—|Vitória de Setúbal|Benfica|Benfica|Benfica|Benfica|Braga|Benfica|Benfica|Benfica|Moreirense FC|Sporting CP|Sporting CP|Braga|Sporting CP|Sporting CP|Porto|Braga|Benfica'), 'https://en.wikipedia.org/wiki/Ta%C3%A7a_da_Liga'),

  competition('CS', 'Community Shield', 'supercup', 'https://www.thefa.com/competitions/the-fa-community-shield', list('Chelsea|Liverpool|Arsenal|Manchester United|Arsenal|Chelsea|Liverpool|Manchester United|Manchester United|Chelsea|Manchester United|Manchester United|Manchester City|Manchester United|Arsenal|Arsenal|Manchester United|Arsenal|Manchester City|Manchester City|Arsenal|Leicester City|Liverpool|Arsenal|Manchester City'), 'https://en.wikipedia.org/wiki/List_of_FA_Community_Shield_matches'),
  competition('SSC', 'Supercopa de España', 'supercup', 'https://rfef.es/es/competiciones/supercopa-de-espana', list('Deportivo La Coruña|Real Madrid|Deportivo La Coruña|Real Madrid|Zaragoza|Barcelona|Barcelona|Sevilla|Real Madrid|Barcelona|Barcelona|Barcelona|Real Madrid|Barcelona|Atlético Madrid|Athletic Bilbao|Barcelona|Real Madrid|Barcelona|Real Madrid|Athletic Bilbao|Real Madrid|Barcelona|Real Madrid|Barcelona'), 'https://en.wikipedia.org/wiki/Supercopa_de_Espa%C3%B1a'),
  competition('SSI', 'Supercoppa Italiana', 'supercup', 'https://www.legaseriea.it/en/supercoppa', list('Lazio|Roma|Juventus FC|Juventus FC|Milan|Inter Milan|Inter Milan|Roma|Inter Milan|Lazio|Inter Milan|Milan|Juventus FC|Juventus FC|Napoli|Juventus FC|Milan|Lazio|Juventus FC|Lazio|Juventus FC|Inter Milan|Inter Milan|Inter Milan|Milan'), 'https://en.wikipedia.org/wiki/Supercoppa_Italiana'),
  competition('DFLS', 'Supercoupe d’Allemagne', 'supercup', 'https://www.bundesliga.com/en/bundesliga/news/supercup-history-all-time-winners-bayern-dortmund-leipzig-27790', list('—|—|—|—|—|—|—|—|—|—|Bayern Munich|Schalke 04|Bayern Munich|Borussia Dortmund|Borussia Dortmund|VfL Wolfsburg|Bayern Munich|Bayern Munich|Bayern Munich|Borussia Dortmund|Bayern Munich|Bayern Munich|Bayern Munich|RB Leipzig|Bayer Leverkusen'), 'https://en.wikipedia.org/wiki/DFL-Supercup'),
  competition('TDC', 'Trophée des Champions', 'supercup', 'https://www.ligue1.com/trophee-des-champions', list('Monaco|Nantes|Lyon|Lyon|Lyon|Lyon|Lyon|Lyon|Bordeaux|Bordeaux|Marseille|Marseille|Lyon|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain|Lille|Paris Saint-Germain|Paris Saint-Germain|Paris Saint-Germain'), 'https://en.wikipedia.org/wiki/Troph%C3%A9e_des_Champions'),
  competition('SCP', 'Supertaça Cândido de Oliveira', 'supercup', 'https://www.fpf.pt/pt/Competi%C3%A7%C3%B5es/Futebol-Masculino/Superta%C3%A7a-C%C3%A2ndido-de-Oliveira', list('Sporting CP|Porto|Sporting CP|Porto|Porto|Benfica|Porto|Sporting CP|Sporting CP|Porto|Porto|Porto|Porto|Porto|Benfica|Sporting CP|Benfica|Benfica|Porto|Benfica|Porto|Sporting CP|Porto|Benfica|Porto'), 'https://en.wikipedia.org/wiki/Superta%C3%A7a_C%C3%A2ndido_de_Oliveira'),
  competition('JCS', 'Johan Cruijff Schaal', 'supercup', 'https://eredivisie.nl/competities/johan-cruijff-schaal/', list('PSV Eindhoven|PSV Eindhoven|Ajax|PSV Eindhoven|Utrecht|Ajax|Ajax|Ajax|PSV Eindhoven|AZ|Twente|Twente|PSV Eindhoven|Ajax|PEC Zwolle|PSV Eindhoven|PSV Eindhoven|Feyenoord|Feyenoord|Ajax|—|PSV Eindhoven|PSV Eindhoven|PSV Eindhoven|Feyenoord'), 'https://en.wikipedia.org/wiki/Johan_Cruyff_Shield'),

  competition('CL', 'Ligue des champions', 'championsLeague', 'https://www.uefa.com/uefachampionsleague/history/', list('Bayern Munich|Real Madrid|Milan|Porto|Liverpool|Barcelona|Milan|Manchester United|Barcelona|Inter Milan|Barcelona|Chelsea|Bayern Munich|Real Madrid|Barcelona|Real Madrid|Real Madrid|Real Madrid|Liverpool|Bayern Munich|Chelsea|Real Madrid|Manchester City|Real Madrid|Paris Saint-Germain'), 'https://www.rsssf.org/tablese/ec1.html'),
  competition('EL', 'Coupe UEFA / Europa League', 'europaLeague', 'https://www.uefa.com/uefaeuropaleague/history/', list('Liverpool|Feyenoord|Porto|Valencia|CSKA Moscow|Sevilla|Sevilla|Zenit Saint Petersburg|Shakhtar Donetsk|Atlético Madrid|Porto|Atlético Madrid|Chelsea|Sevilla|Sevilla|Sevilla|Manchester United|Atlético Madrid|Chelsea|Sevilla|Villarreal|Eintracht Frankfurt|Sevilla|Atalanta|Tottenham Hotspur'), 'https://www.rsssf.org/ec/ec3stats.html'),
  competition('ECL', 'Conference League', 'conferenceLeague', 'https://www.uefa.com/uefaconferenceleague/history/', list('—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|—|Roma|West Ham United|Olympiacos|Chelsea'), 'https://www.rsssf.org/ec/'),
  competition('USC', 'Supercoupe UEFA', 'supercup', 'https://www.uefa.com/uefasupercup/history/', list('Galatasaray|Liverpool|Real Madrid|Milan|Valencia|Liverpool|Sevilla|Milan|Zenit Saint Petersburg|Barcelona|Atlético Madrid|Barcelona|Atlético Madrid|Bayern Munich|Real Madrid|Barcelona|Real Madrid|Real Madrid|Atlético Madrid|Liverpool|Bayern Munich|Chelsea|Real Madrid|Manchester City|Real Madrid'), 'https://www.uefa.com/uefachampionsleague/news/0250-0c511a04f303-e09c8992bb78-1000--uefa-super-cup-roll-of-honour/'),
  competition('FIFA', 'Titre mondial FIFA', 'world', 'https://www.fifa.com/en/tournaments/mens/club-world-cup', list('Corinthians|—|—|—|—|São Paulo|Internacional|Milan|Manchester United|Barcelona|Inter Milan|Barcelona|Corinthians|Bayern Munich|Real Madrid|Barcelona|Real Madrid|Real Madrid|Real Madrid|Liverpool|Bayern Munich|Chelsea|Real Madrid|Manchester City|Real Madrid'), 'https://www.rsssf.org/tablesf/fifawcc.html'),
];

const NO_TITLE = {
  'SA:2004': 'Titre révoqué après Calciopoli ; aucun champion attribué.',
  'DED:2019': 'Saison interrompue par la pandémie ; aucun champion attribué.',
  'KNVB:2019': 'Compétition abandonnée pendant la pandémie.',
  'CDL:2020': 'Compétition supprimée après l’édition 2019/20.',
  'CDL:2021': 'Compétition supprimée.', 'CDL:2022': 'Compétition supprimée.',
  'CDL:2023': 'Compétition supprimée.', 'CDL:2024': 'Compétition supprimée.',
  'TDL:2000': 'Compétition créée en 2007/08.', 'TDL:2001': 'Compétition créée en 2007/08.',
  'TDL:2002': 'Compétition créée en 2007/08.', 'TDL:2003': 'Compétition créée en 2007/08.',
  'TDL:2004': 'Compétition créée en 2007/08.', 'TDL:2005': 'Compétition créée en 2007/08.',
  'TDL:2006': 'Compétition créée en 2007/08.',
  'DFLS:2000': 'Supercoupe officielle non disputée.', 'DFLS:2001': 'Supercoupe officielle non disputée.',
  'DFLS:2002': 'Supercoupe officielle non disputée.', 'DFLS:2003': 'Supercoupe officielle non disputée.',
  'DFLS:2004': 'Supercoupe officielle non disputée.', 'DFLS:2005': 'Supercoupe officielle non disputée.',
  'DFLS:2006': 'Supercoupe officielle non disputée.', 'DFLS:2007': 'Supercoupe officielle non disputée.',
  'DFLS:2008': 'Édition non organisée par la DFL.', 'DFLS:2009': 'Édition non organisée par la DFL.',
  'JCS:2020': 'Édition annulée pendant la pandémie.',
  'ECL:2000': 'Compétition créée en 2021/22.', 'ECL:2001': 'Compétition créée en 2021/22.',
  'ECL:2002': 'Compétition créée en 2021/22.', 'ECL:2003': 'Compétition créée en 2021/22.',
  'ECL:2004': 'Compétition créée en 2021/22.', 'ECL:2005': 'Compétition créée en 2021/22.',
  'ECL:2006': 'Compétition créée en 2021/22.', 'ECL:2007': 'Compétition créée en 2021/22.',
  'ECL:2008': 'Compétition créée en 2021/22.', 'ECL:2009': 'Compétition créée en 2021/22.',
  'ECL:2010': 'Compétition créée en 2021/22.', 'ECL:2011': 'Compétition créée en 2021/22.',
  'ECL:2012': 'Compétition créée en 2021/22.', 'ECL:2013': 'Compétition créée en 2021/22.',
  'ECL:2014': 'Compétition créée en 2021/22.', 'ECL:2015': 'Compétition créée en 2021/22.',
  'ECL:2016': 'Compétition créée en 2021/22.', 'ECL:2017': 'Compétition créée en 2021/22.',
  'ECL:2018': 'Compétition créée en 2021/22.', 'ECL:2019': 'Compétition créée en 2021/22.',
  'ECL:2020': 'Compétition créée en 2021/22.',
  'FIFA:2001': 'Coupe du monde des clubs annulée.', 'FIFA:2002': 'Compétition non disputée.',
  'FIFA:2003': 'Compétition non disputée.', 'FIFA:2004': 'Compétition non disputée.',
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

/** Build the comparable, versioned trophy catalogue and reject gaps or API disagreements. */
export function buildHonoursCatalog(summary, apiHonours = null, fetchedAt = new Date().toISOString()) {
  const clubIndex = activeClubIndex(summary);
  const titles = [];
  const coverage = [];
  const expectedLength = HONOURS_YEAR_MAX - HONOURS_YEAR_MIN + 1;

  for (const item of CATALOG) {
    if (item.winners.length !== expectedLength) throw new Error(`Catalogue palmarès incomplet pour ${item.code}`);
    const missingSeasons = [];
    let matchedTitleCount = 0;
    let outsideScopeTitleCount = 0;
    item.winners.forEach((rawName, offset) => {
      const season = HONOURS_YEAR_MIN + offset;
      if (rawName == null) {
        const reason = NO_TITLE[`${item.code}:${season}`];
        if (!reason) throw new Error(`Saison sans trophée non documentée : ${item.code}:${season}`);
        missingSeasons.push({ season, reason });
        return;
      }
      const clubName = CLUB_ALIASES.get(rawName) || rawName;
      const ids = clubIndex.get(clubName) || [];
      const outsideScope = OUTSIDE_SCOPE_CLUBS.has(clubName);
      if (!outsideScope && ids.length !== 1) throw new Error(`Club de palmarès introuvable ou ambigu : ${clubName}`);
      if (outsideScope) outsideScopeTitleCount += 1;
      else matchedTitleCount += 1;
      titles.push({
        competitionCode: item.code,
        competitionName: item.name,
        category: item.category,
        season,
        source: item.source,
        verificationSource: item.verificationSource,
        winner: { providerId: null, name: clubName, clubId: outsideScope ? null : ids[0], outsideScope },
      });
    });
    coverage.push({
      code: item.code, name: item.name, category: item.category,
      source: item.source, verificationSource: item.verificationSource,
      yearMin: HONOURS_YEAR_MIN, yearMax: HONOURS_YEAR_MAX,
      titleCount: matchedTitleCount + outsideScopeTitleCount,
      matchedTitleCount, outsideScopeTitleCount, missingSeasons,
    });
  }

  const catalogByKey = new Map(titles.map((title) => [`${title.competitionCode}:${title.season}`, title]));
  let crossCheckedTitleCount = apiHonours?.meta?.catalogVersion
    ? Math.min(Number(apiHonours.meta.crossCheckedTitleCount) || 0, titles.length)
    : 0;
  const disagreements = [];
  for (const apiTitle of apiHonours?.meta?.catalogVersion ? [] : apiHonours?.titles || []) {
    const catalogTitle = catalogByKey.get(`${apiTitle.competitionCode}:${apiTitle.season}`);
    if (!catalogTitle || apiTitle.winner?.clubId == null) continue;
    crossCheckedTitleCount += 1;
    if (catalogTitle.winner.clubId !== apiTitle.winner.clubId) {
      disagreements.push(`${apiTitle.competitionCode}:${apiTitle.season} (${catalogTitle.winner.name} ≠ ${apiTitle.winner.name})`);
    }
  }
  if (disagreements.length) throw new Error(`Désaccord palmarès avec football-data.org : ${disagreements.join(', ')}`);

  titles.sort((a, b) => a.season - b.season || a.competitionCode.localeCompare(b.competitionCode));
  const matchedTitleCount = titles.filter((title) => title.winner.clubId != null).length;
  const outsideScopeTitleCount = titles.length - matchedTitleCount;
  return {
    meta: {
      status: 'ready',
      provider: 'Sources officielles, recoupées avec football-data.org et des historiques indépendants',
      catalogVersion: HONOURS_CATALOG_VERSION,
      fetchedAt,
      competitionCount: coverage.length,
      titleCount: titles.length,
      matchedTitleCount,
      unmatchedTitleCount: 0,
      outsideScopeTitleCount,
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
