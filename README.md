# ⚽ Footato

Plateforme de lecture économique du football : **montants de transferts** mercato par mercato,
et, dans une page distincte, **comptes annuels publiés** des clubs français et anglais.

Pas de fiches joueurs — le sujet, ce sont les flux d'argent : qui dépense, qui encaisse,
et ce qu'il reste à la fin de chaque mercato.

## Ce que fait le site

- **Tri sur toutes les colonnes** — achats, ventes, bilan, volume, nombre d'arrivées/départs.
- **Filtres combinables** — plage de saisons, mercato (été/hiver), championnat, club,
  bilan excédentaire ou déficitaire, volume minimum.
- **Quatre niveaux de lecture** — par mercato (club × fenêtre), par club, par championnat, par saison.
- **Détail d'un mercato** — cliquez une ligne : structure des mouvements (payants / libres / prêts /
  non divulgués), classement du club dans son championnat sur cette fenêtre, historique complet du
  club, et la liste des mouvements avec leurs montants.
- **Vue partageable** — chaque combinaison de filtres, tri et mercato ouvert a sa propre URL.
- **Export CSV** de la vue courante.
- **Graphique modulable** — total par saison, été seul, hiver seul ou deux fenêtres séparées.
- **Derniers transferts vérifiés** — les mouvements les plus récents publiés par la source, avec
  pour chacun s'il figure déjà dans les données, et le retard en jours s'il y en a.
- **Contrôle d'effectifs récent** — sept championnats et la Ligue des champions sont relevés
  automatiquement ; les changements détectés restent signalés à part jusqu'à confirmation.
- **Classements auditables** — top dépenses, bénéfices et ventes, avec la complétude des indemnités
  visible pour chaque ligne plutôt qu'un classement présenté comme exact à tort.
- **Investissement comparé aux titres** — achats, investissement net ou ventes face à un indice
  sportif pondéré, avec championnats, coupes nationales et titres continentaux séparés visuellement.
- **Comptes annuels séparés du mercato** — revenus, masse salariale, résultat net, fonds propres,
  trésorerie et détail du bilan, avec exercice, devise, périmètre et document officiel visibles.

## Démarrer

```bash
npm install
npm run data     # télécharge les CSV sources puis construit le jeu de données
npm run dev
```

`npm run build` produit un site statique dans `dist/` (aucun serveur nécessaire).

## Les données

Le pipeline combine trois origines dérivées de **Transfermarkt** et deux sources de contrôle.
Chaque saison est fournie par **une seule** origine : elles sont superposées, jamais fusionnées,
donc aucun mouvement n'est compté deux fois sous deux identifiants amont.

- [`ewenme/transfers`](https://github.com/ewenme/transfers) pour l'historique typé
  (transfert libre, prêt, indemnité de prêt, fin de prêt) jusqu'en 2022/23 ;
- [`dcaribou/transfermarkt-datasets`](https://github.com/dcaribou/transfermarkt-datasets)
  pour les saisons intermédiaires ;
- **la collecte Footato** (`scripts/collect-transfermarkt.mjs`) pour la saison en cours, lue
  directement sur Transfermarkt sans intermédiaire — voir [Collecte directe](#collecte-directe) ;
- [`openfootball/football.json`](https://github.com/openfootball/football.json) pour vérifier,
  indépendamment des transferts, la composition des championnats de la saison en cours ;
- [`football-data.org`](https://www.football-data.org/) pour relever les effectifs de Premier League,
  LaLiga, Serie A, Bundesliga, Ligue 1, Primeira Liga, Eredivisie et Ligue des champions.

Le relevé football-data.org ne fournit pas les indemnités de transfert. Il sert donc de radar : un
joueur qui change d'équipe entre deux relevés produit un signal, mais ce signal ne modifie jamais les
montants ou les agrégats Transfermarkt sans une source financière confirmée.

Le palmarès n'est pas déduit des scores et ne dépend pas de la profondeur inégale d'une API. Un catalogue
versionné reprend, pour chaque saison 2000/01 à 2024/25, les historiques officiels de la
[Premier League](https://www.premierleague.com/en/premier-league-explained), de
[LaLiga](https://www.laliga.com/noticias/todos-los-campeones-de-la-historia-de-laliga), de la
[Serie A](https://www.legaseriea.it/serie-a/albo), de la
[Bundesliga](https://www.bundesliga.com/de/bundesliga/news/liste-deutscher-meister-bundesliga-koln-bayern-nurnberg-dortmund-bremen-kaiserslautern-23908), de la
[Ligue 1](https://ligue1.com/fr/articles/l1_article_289-le-palmares-des-champions-de-ligue-1), de la
[Liga Portugal](https://www.ligaportugal.pt/pages/historia), de l'
[Eredivisie](https://eredivisie.nl/nieuws/psv-voor-de-26e-keer-kampioen-van-nederland/) et de l'
[UEFA](https://www.uefa.com/uefachampionsleague/history/). Les entrées que fournit football-data.org
sont recoupées automatiquement ; le build échoue au premier désaccord.

Footato ne parle pas de « palmarès total » : la vue compare uniquement les 29 compétitions documentées
dans le catalogue. Les saisons sans champion ne sont pas transformées en zéro silencieux : Serie A
2004/05 (titre révoqué) et Eredivisie 2019/20 (saison interrompue) sont explicitement documentées.

Les championnats couverts sont la Premier League, LaLiga, Serie A, Bundesliga, Ligue 1,
Liga Portugal, Eredivisie, Premier Liga russe, Championship et la **Saudi Pro League**.
La couverture maximale de chaque championnat est publiée séparément dans `summary.json` : une
saison n'est jamais attribuée à un championnat par simple supposition.

La Saudi Pro League entre dans le périmètre avec une profondeur volontairement courte. Aucune
des deux sources historiques ne la couvre, et l'export de matchs maintenu ne la fournit qu'à
partir de 2024/25 : les saisons publiées sont donc **2024/25, 2025/26 et la saison en cours**,
sans reconstitution des années antérieures.

### Comptes annuels — pipeline indépendant

La page **Finances** ne réutilise aucun agrégat de transfert. Elle lit son propre fichier,
`public/data/finance.json`, où les valeurs restent dans la devise du dépôt et en milliers.
Le MVP contient :

- les 20 clubs de Ligue 1 2022/23, dernier rapport de comptes individuels disponible dans
  l'[archive DNCG de la LFP](https://www.sta.lfp.fr/reports-dncg) ;
- Arsenal, Liverpool et Manchester City sur leur exercice 2025, à partir des comptes déposés
  sur [Companies House](https://find-and-update.company-information.service.gov.uk/).

La France est extraite automatiquement du format standard DNCG avec `pdfplumber`. L'exception
de présentation d'Olympique Lyonnais est explicitement relue et les champs non comparables restent
vides. Les dépôts Companies House étant des PDF scannés et non des données structurées, le collecteur
détecte et télécharge le dernier dépôt mais ne remplace la normalisation anglaise qu'après revue.
Un nouveau dépôt est marqué `pending-review` au lieu de publier silencieusement des chiffres anciens
sous une date nouvelle.

```bash
python -m pip install -r requirements-finance.txt
npm run finance:refresh       # collecte, extrait, construit et valide
npm run finance:build         # reconstruit depuis les normalisations versionnées
npm run finance:validate      # bilans, revenus, schéma et provenance
```

Les comparaisons sont faites **dans un pays à la fois**. Il n'y a ni taux de change implicite,
ni estimation d'un poste absent, ni confusion entre valeur comptable et valeur de marché du club.

### Collecte directe

En juillet 2026 le scraper qui alimente `dcaribou/transfermarkt-datasets` a été bloqué par
Transfermarkt. Son dépôt a continué d'être servi, figé, et Footato a publié pendant six semaines
un mercato amputé d'environ 90 % sans que rien n'échoue : l'instantané n'avait que 22 jours, et
le seuil de fraîcheur était à 45. Dépendre d'un instantané que quelqu'un d'autre rafraîchit était
le vrai point unique de défaillance.

`scripts/collect-transfermarkt.mjs` lit désormais la saison en cours directement. Transfermarkt
rend tous les clubs d'un championnat, les deux sens et l'indemnité sur **une seule page** par
saison et par fenêtre, donc un rafraîchissement complet des dix championnats coûte **20 requêtes**.
C'est là toute la stratégie : ce qui déclenche une détection de robot, c'est le volume, et le
moyen le plus simple de ne pas le déclencher est de ne pas en avoir besoin. Aucun contournement
n'est tenté ; `robots.txt` autorise l'exploration, et une page refusée fait échouer la collecte
au lieu d'être publiée à moitié.

Le collecteur est plus fidèle que l'import qu'il remplace sur ces saisons. La source maintenue
ramène prêts, fins de prêt et transferts libres à un même libellé et perd les indemnités de prêt :
elle en contient **zéro** sur tout l'historique. La lecture directe les restitue — 152 sur les
seules Serie A et Premier League 2025/26 — et sépare à nouveau `free transfer`, `loan transfer`
et `End of loan`.

Les deux origines se recoupent sur une saison terminée, ce qui est la seule façon de faire
confiance au collecteur là où plus rien ne le contrôle :

```bash
npm run data:collect -- --seasons 2025 --leagues GB1,IT1 --out /tmp/verif
npm run data:compare -- --a data/raw/recent --b /tmp/verif --season 2025
```

Sur 2025/26 l'écart d'achats est de **0,5 %** en Premier League et **2,3 %** en Serie A, le
collecteur trouvant légèrement plus que l'import. Au-delà de 5 % la comparaison échoue.
La collecte se fait dans un dossier séparé pour ne pas écraser celle qui est publiée.

Le parseur a par ailleurs son propre test de non-régression, hors réseau, sur une page réelle
figée dans `data/fixtures/` (`npm run collector:verify`). Il vérifie que chaque libellé
d'indemnité tombe sur le bon type, qu'aucune ligne ne perd son joueur, son club ou son montant,
et qu'une cellule illisible devient « non divulgué » plutôt que zéro euro. C'est le mode de
panne qui compte : un changement de balisage chez Transfermarkt ne lève pas d'erreur, il rend
une chaîne vide — et une indemnité vide se lit comme un transfert libre.

La collecte est versionnée dans `data/raw/collected/`, contrairement aux imports : elle ne peut
pas être retéléchargée, puisque c'est la lecture de pages qui changent chaque jour. Le dépôt garde
ainsi le dernier bon mercato, et l'historique git montre l'état de la fenêtre à chaque build.

**Une identité de club par club, quelle que soit l'origine.** Les trois sources n'orthographient
pas les clubs pareil : l'historique écrit `FK Rostov`, Transfermarkt `FC Rostov`, et l'import
maintenu déroule les raisons sociales (`Al-Hilal Saudi Football Club`). Sans réconciliation,
l'histoire d'un club se coupe en deux à la saison où une nouvelle origine prend le relais.
`scripts/lib/club-aliases.mjs` tient la liste, explicite et relue — un rapprochement automatique
par ressemblance fusionnerait des clubs réellement distincts, et une fusion erronée est invisible
dans le résultat : elle ressemble à un club qui a simplement acheté davantage. La table est
appliquée au moment du build, en un seul point, pour qu'une correction n'oblige pas à recollecter.
Les identifiants de clubs figurant dans les URL partageables, la cible d'un alias est toujours le
nom qui porte déjà l'historique — sauf pour la Saudi Pro League, arrivée avec le collecteur, où
rien ne dépendait encore des raisons sociales et où les noms d'usage l'emportent.

### Actualiser tout le jeu de données

```bash
npm run data:refresh
```

Cette commande :

1. télécharge les trois sources avec trois tentatives, écriture atomique et empreinte SHA-256 ;
2. reconstruit l'appartenance `club × saison × championnat` depuis les matchs, puis exige une
   correspondance intégrale des clubs de la saison courante avec la source de contrôle ;
3. exclut les mouvements futurs et les couples saison/date incohérents ;
4. **collecte la saison en cours directement sur Transfermarkt**, en 20 requêtes espacées ;
5. déduplique, agrège, puis vérifie chaque agrégat contre les mouvements détaillés ;
6. rattache chaque titre à l'identifiant stable du club et bloque la publication si le catalogue
   officiel et une saison disponible dans l'API désignent des vainqueurs différents.

La collecte seule, sans retélécharger les imports :

```bash
npm run data:collect                          # saison en cours, tous les championnats
npm run data:collect -- --leagues GB1,SA1     # un sous-ensemble
npm run data:collect -- --seasons 2025,2026   # plusieurs saisons
```

### Derniers transferts : une fraîcheur vérifiable, pas déclarée

Toutes les autres indications de fraîcheur du site sont auto-déclarées — le jeu de données annonce
sa date de collecte, et il faut le croire sur parole. Celle-ci est réfutable.

La page « Latest transfers » de Transfermarkt est la seule vue portant une **date de transfert**,
et elle expose le même `transfer_id` que les pages championnat que lit le collecteur. Croiser les
deux répond exactement à la question « lesquels des mouvements d'hier as-tu ? », sur un
identifiant et non sur une comparaison de noms.

```bash
npm run data:latest
```

Une requête par championnat. Le résultat va dans `public/data/latest.json` et s'affiche dans la
section Complétude : les mouvements **pas encore pris en compte** sont listés à part et
intégralement — rangés avec les autres, ce sont les premiers que le plafond d'affichage
tronquerait, alors que ce sont ceux qu'il faut voir. Le panneau affiche aussi le retard : dernière
date publiée par la source, dernière date réellement présente, et l'écart en jours.

Un mouvement absent n'est pas une anomalie en soi : la collecte a simplement tourné avant sa
publication. Il n'entre dans aucun montant tant qu'il n'a pas été collecté, et n'est jamais estimé.
Ce fichier est un diagnostic, au même titre que le radar d'effectifs : il ne modifie aucun agrégat.

Le taux de prise en compte est contrôlé au build (`FOOTATO_MIN_INCLUSION_RATE`, plancher 60 %).
C'est une alarme plus fine qu'une date : un championnat dont la page cesse de lister les mouvements,
ou un parseur qui en perd silencieusement, reste faux même quand la collecte a tourné à l'heure —
et n'apparaît nulle part ailleurs.

### La fraîcheur est jugée sur ce à quoi sert la donnée

Un seuil unique de 45 jours est exactement ce qui a laissé passer le blocage de juillet 2026.
C'est un âge raisonnable pour une saison terminée — elle ne bouge plus — et catastrophique pour
un mercato ouvert, qui change tous les jours.

La validation distingue donc les deux :

| Contrôle | Comportement |
|---|---|
| Âge de la saison en cours, mercato ouvert (janvier, juin-septembre) | échec au-delà de **7 jours** |
| Âge de la saison en cours, hors fenêtre | échec au-delà de **45 jours** |
| Volume de la saison en cours face à la précédente, par championnat | échec sous **25 %** (`FOOTATO_MIN_SEASON_RATIO`) |
| Fenêtre de collecte déclarée en échec sur la saison en cours | échec |
| Composition collectée sous 14 clubs | échec |
| Transferts récents présents dans les données | échec sous **60 %** (`FOOTATO_MIN_INCLUSION_RATE`) |
| Âge du relevé des derniers transferts | mêmes limites que la saison en cours |

Le plancher de 25 % est volontairement bas : un mercato en cours contient légitimement moins de
mouvements qu'une saison finie — environ la moitié des montants d'un été sont enregistrés après
début août. Ce n'est pas une mesure de complétude, c'est un plancher qui attrape une source ayant
cessé d'ingérer. Sur les données de juillet 2026 la Premier League était à 6,7 % : l'échec aurait
été immédiat.

L'âge seul ne suffit pas — une source peut être republiée chaque jour sans plus rien ingérer —
et le volume seul non plus. Les deux ensemble couvrent les deux façons de se figer.

La validation ne se limite pas au nombre de lignes : elle recalcule indépendamment les montants,
les indemnités de prêt, chaque catégorie de mouvement, les arrivées et les départs depuis les
193 756 mouvements détaillés. Une seconde suite exerce les filtres, les quatre regroupements,
les tris et les quatre modes du graphique sur près de 200 scénarios.

Le workflow GitHub Actions rejoue le pipeline complet à chaque déploiement. Toutes les six heures,
il effectue aussi un relevé léger des effectifs, compare avec le dernier relevé publié, valide le
résultat puis redéploie le site. Le token `FOOTBALL_DATA_TOKEN` reste exclusivement dans les secrets
GitHub Actions et n'est jamais envoyé au navigateur. Une source vieille de plus de 45 jours fait
échouer la validation au lieu d'être publiée silencieusement.

### Limites connues, exposées plutôt que masquées

- Les montants sont ceux publiés par Transfermarkt, pas les contrats confidentiels des clubs.
  Ils peuvent être estimés, arrondis ou révisés après la fermeture d'une saison.
- La source maintenue ramène les prêts, fins de prêt et transferts libres à 0 € et perd les
  indemnités de prêt. Les saisons qu'elle fournit gardent cette limite ; la collecte directe ne
  l'a pas, donc la saison en cours et l'historique ancien sont plus fins que les saisons
  intermédiaires. C'est une hétérogénéité réelle, indiquée par origine dans `summary.json`.
- **Les compositions russe et saoudienne ne sont recoupées par rien.** Aucune source de calendrier
  indépendante ne publie ces deux championnats : leur effectif repose sur Transfermarkt seul, qui
  fournit aussi leurs transferts. Les sept autres championnats gardent leur contre-vérification
  openfootball. La page Complétude nomme explicitement les championnats concernés.
- **Les runners GitHub Actions sont bloqués par Transfermarkt** — c'est la cause du blocage amont.
  La collecte en CI est donc tentée sans être bloquante, et retombe sur la collecte versionnée.
  Ce n'est pas une tolérance à la donnée périmée : la validation échoue quand même si la saison
  en cours dépasse la limite d'âge. Le correctif est `npm run data:collect` depuis une adresse
  résidentielle, ou un `BRIGHTDATA_API_KEY` pour router les pages refusées.
- Une saison récente sans table d'appartenance fiable est retenue en amont mais n'est pas publiée.
  Le manifeste indique combien de lignes ont été écartées pour cette raison.

Le périmètre est celui des clubs des championnats couverts : un transfert vers ou depuis un
club hors périmètre compte pour le club couvert et est ignoré pour l'autre.

### Alimenter le site depuis n'importe quelle autre source

`scripts/build-dataset.mjs` lit *tous* les CSV de `data/raw/` (et de `data/raw/recent/`),
quelle que soit leur provenance, dès lors qu'ils respectent le schéma ci-dessous.

Schéma attendu (une ligne = un mouvement, vu depuis le club) :

| Colonne | Contenu |
|---|---|
| `club_name` | club concerné |
| `player_name` | joueur |
| `age`, `position` | facultatifs |
| `club_involved_name` | l'autre club |
| `fee` | libellé brut : `€25.00m`, `€900Th.`, `free transfer`, `loan transfer`, `Loan fee:€2.00m`, `End of loan…`, `?`, `-` |
| `transfer_movement` | `in` (arrivée) ou `out` (départ) |
| `transfer_period` | `Summer` ou `Winter` |
| `fee_cleaned` | montant en **millions d'euros**, ou `NA` |
| `league_name`, `country` | championnat du club |
| `year` | année de début de saison — le mercato d'hiver 2022/23 porte `year = 2022` |
| `season` | `2022/2023` |

## Méthode de calcul

Les montants sont stockés en **milliers d'euros entiers**, donc l'arithmétique n'ajoute pas
d'erreur flottante. Cela ne rend pas exact un montant estimé ou non divulgué par la source.
Chaque mouvement est classé par type :

| Type | Compté dans les montants ? |
|---|---|
| Transfert payant (`€…`) | **oui** — c'est l'essentiel des achats et des ventes |
| Indemnité de prêt (`Loan fee:…`) | **optionnel** — bouton dans les filtres, désactivé par défaut |
| Transfert libre | non (0 €), mais compté dans les arrivées/départs |
| Prêt sec / fin de prêt | non (0 €), compté dans les arrivées/départs |
| Montant explicitement indisponible (`?`) | non (0 €), compté dans les arrivées/départs et dans le dénominateur de complétude |
| Administratif / sans indemnité applicable (retraite, sans club, réserves) | non (0 €), compté dans les mouvements mais exclu de la complétude |
| Libre ou prêt (saisons importées) | non (0 €), compté dans les arrivées/départs |

**Conséquence à garder en tête : les totaux sont des planchers.** La complétude est calculée par
`indemnités publiques ÷ (indemnités publiques + indemnités explicitement indisponibles)`. Elle ne
prétend pas mesurer la justesse de Transfermarkt et ne compte pas comme « inconnu » un mouvement
pour lequel aucune indemnité commerciale n'est attendue. Un total n'est jamais extrapolé à partir
d'une moyenne : `100 M€` signifie « au moins 100 M€ documentés ».

Autres partis pris :

- Un **mercato** est un moment — une saison et une période, été ou hiver — et il vaut pour tous
  les clubs à la fois. Une **ligne** détaillée représente l'activité d'un club sur ce mercato.
- Un club relégué ou promu change de championnat d'une saison à l'autre : chaque ligne porte
  le championnat de la saison concernée.
- Un transfert entre deux clubs couverts apparaît une fois comme achat, une fois comme vente —
  ce sont deux clubs différents, il n'y a pas de double comptage.
- Le mercato d'hiver d'une saison se déroule en janvier de l'année civile suivante ; le site
  l'affiche sous la saison (`2022/23 · Hiver`) et le détail rappelle l'année réelle.

## Palmarès comparable

Les classements de clubs couvrent **674 trophées attribués dans 29 compétitions** entre
2000/01 et 2024/25 : les sept championnats, les sept coupes nationales, les coupes de la
Ligue anglaise, française et portugaise, les sept supercoupes nationales, la Ligue des
champions, la Coupe UEFA / Europa League, la Conference League, la Supercoupe UEFA et les
titres mondiaux FIFA.

La comparaison emploie un indice éditorial transparent : 10 points pour une Ligue des champions,
6 pour une Premier League, 5,5 pour LaLiga, 5 pour la Serie A ou la Bundesliga, 4 pour la Ligue 1
et 3 pour la Liga Portugal ou l’Eredivisie. Les compétitions de coupe vont de 0,5 point pour une
supercoupe nationale à 5 points pour l’Europa League ou un titre mondial. Tous les coefficients
sont visibles directement dans la page ; ils ne prétendent pas constituer un classement officiel.
Les trois familles de titres restent affichées séparément pour que l’indice ne masque jamais le
palmarès brut. Les 51 éditions non organisées, supprimées ou annulées sont documentées explicitement ;
elles ne deviennent jamais des zéros attribués. Dix titres UEFA/FIFA remportés par des clubs hors des
sept pays restent dans le contrôle de couverture, mais pas dans le classement Footato.

Le catalogue est versionné et le build échoue en cas de saison vide non expliquée, de club
intra-périmètre introuvable, de doublon ou de désaccord avec l'historique football-data.org.
Chaque compétition conserve sa source officielle et, pour les coupes, une source de
recoupement indépendante.

## Structure

```
scripts/fetch-source.mjs    télécharge, empreinte et date les sources dans data/raw/
scripts/import-recent.mjs   normalise les saisons récentes avec appartenance saisonnière
scripts/collect-transfermarkt.mjs lit la saison en cours sur Transfermarkt, sans intermédiaire
scripts/compare-origins.mjs recoupe deux origines sur une même saison
scripts/collect-latest.mjs  relève les derniers transferts et dit lesquels sont pris en compte
scripts/build-dataset.mjs   agrège les CSV -> public/data/
scripts/validate-dataset.mjs vérifie agrégats, détails, couverture et fraîcheur
scripts/verify-collector.mjs contrôle le parseur hors réseau sur une page réelle figée
scripts/sync-football-data.mjs relève les effectifs et détecte les changements
scripts/lib/transfermarkt.mjs client poli, détection de blocage et parseur
scripts/lib/club-aliases.mjs une identité de club unique à travers les trois origines
scripts/lib/honours-catalog.mjs catalogue officiel versionné et contre-vérifié des titres
scripts/finance/collect.mjs  télécharge DNCG et derniers dépôts Companies House
scripts/finance/extract-dncg.py extrait les tableaux de comptes Ligue 1
scripts/finance/build.mjs    publie le jeu financier indépendant
scripts/finance/validate.mjs contrôle bilans, ventilation, schéma et sources
data/finance/               registre, extraction DNCG et normalisation anglaise relue
data/raw/collected/         la collecte propre, versionnée (elle n'est pas retéléchargeable)
data/fixtures/              page réelle figée servant de test de non-régression au parseur
public/data/summary.json    championnats, clubs, un agrégat par club × saison × fenêtre (~0,5 Mo)
public/data/freshness.json  dernier relevé d'effectifs et signaux séparés des agrégats
public/data/latest.json     derniers transferts publiés, et lesquels figurent dans les données
public/data/finance.json    comptes annuels normalisés France + Angleterre
public/data/windows/*.json  les mouvements de chaque fenêtre, chargés à la demande
src/lib/                    types, agrégation, filtres, formatage
src/components/             filtres, tuiles, graphiques, tableau, panneau de détail
```

`summary.json` est chargé au démarrage (tout le tri et le filtrage se font côté client, sans
requête réseau) ; les fichiers `windows/` ne sont téléchargés qu'à l'ouverture d'un mercato.

## Auto-hébergement — la seule façon d'être vraiment à jour

Transfermarkt refuse les adresses de centre de données. C'est pour ça que GitHub
Actions ne peut pas collecter, et que le site publié se fige jusqu'à ce que quelqu'un
relance le pipeline à la main. Une connexion résidentielle n'a pas ce problème.

Servir le site **depuis chez soi** supprime la contrainte au lieu de la contourner :
la collecte tourne là où elle fonctionne déjà, toute seule, toutes les six heures.

```bash
cp .env.example .env        # puis renseignez FOOTATO_ADMIN_TOKEN
docker compose up -d --build
```

Le conteneur sert le site sur `127.0.0.1:8080` et se met à jour seul. Faites-le
pointer par Nginx Proxy Manager vers le sous-domaine de votre choix — c'est lui
qui gère le certificat.

| Réglage | Défaut | Rôle |
|---|---|---|
| `REFRESH_INTERVAL_HOURS` | `6` | Intervalle entre deux collectes. `0` désactive le minuteur. |
| `REFRESH_FULL_EVERY` | `4` | Une passe sur quatre retélécharge les instantanés tiers (20 Mo). |
| `FOOTATO_ADMIN_TOKEN` | *(vide)* | Sans lui, le bouton « Collecter » et l'endpoint restent inertes. |
| `FOOTBALL_DATA_TOKEN` | *(vide)* | Facultatif : active le contrôle d'effectifs. |
| `FINANCE_PYTHON` | Python du conteneur | Interpréteur avec `pdfplumber` pour la DNCG. |

Une passe légère prend environ **100 secondes** et coûte **30 requêtes** : 20 pages
de championnat, 10 relevés de derniers transferts. À raison de quatre passes par
jour, 120 requêtes quotidiennes — sans commune mesure avec le crawl mondial qui se
fait bloquer.

### Le bouton

La page Complétude affiche « Collecter » et un panneau d'état — dernière collecte,
résultat, prochaine échéance — **uniquement quand un service répond**. Sur un
hébergement statique, `/api/status` n'existe pas et les commandes restent masquées :
le même build reste publiable sur GitHub Pages sans proposer un bouton que rien
n'honorerait.

Le jeton se saisit une fois et reste dans le navigateur. Il ne fait jamais partie
du build.

### Points d'attention

- **Un échec de collecte ne dégrade pas le site** : la version précédente reste
  servie, et l'échec est visible dans le panneau plutôt qu'avalé. C'est le bon
  arbitrage — un mercato à moitié collecté ne doit pas être publié — mais il ne
  doit pas passer inaperçu.
- **Le volume `footato-data` fait foi.** Docker l'initialise avec le contenu de
  l'image au premier lancement, puis ne l'écrase plus : l'instance qui tourne est
  plus à jour que le dépôt. Pour repartir de la collecte versionnée,
  `docker compose down -v`.
- **N'exposez pas `/api/refresh` sans jeton.** Sans `FOOTATO_ADMIN_TOKEN`
  l'endpoint répond 503 et refuse tout, ce qui est le défaut sûr ; avec un jeton,
  laissez Nginx Proxy Manager gérer le TLS devant.
- GitHub Pages continue de fonctionner en parallèle, avec la fraîcheur de ce qui
  a été committé. Les deux hébergements coexistent sans se gêner.

## Déploiement

`.github/workflows/deploy.yml` construit le site et le publie sur GitHub Pages à chaque push
sur `main` ou sur une branche `claude/**`.

> **Réglage indispensable — Settings → Pages → Source : « GitHub Actions ».**
>
> Laissé sur « Deploy from a branch », GitHub publie les **fichiers source** du dépôt au lieu
> du site construit. L'`index.html` de la racine est l'entrée de développement de Vite : elle
> pointe vers `/src/main.tsx`, que le navigateur ne sait pas exécuter. Résultat, une **page
> blanche** — et comme le pipeline de branche se relance à chaque push, il écrase la
> publication du workflow quelques secondes après elle. Les deux apparaissent « en succès »
> dans l'onglet Actions, ce qui rend le symptôme trompeur.
>
> Une fois la source basculée, le pipeline de branche disparaît de lui-même. Inutile de créer
> un workflow depuis les modèles proposés par GitHub (« Jekyll », « Static HTML ») : celui du
> dépôt fait déjà le travail.

Le chemin de base est déduit du nom du dépôt (`BASE_PATH=/<repo>/`), donc le site fonctionne
tel quel sur `https://<utilisateur>.github.io/<repo>/`. Pour un autre hébergement :
`npm run build` puis servez `dist/` (ajustez `BASE_PATH` si le site n'est pas à la racine).

## Licence et attribution

Données © [Transfermarkt](https://www.transfermarkt.com/), agrégées via
[`ewenme/transfers`](https://github.com/ewenme/transfers) et
[`dcaribou/transfermarkt-datasets`](https://github.com/dcaribou/transfermarkt-datasets).
Compositions de ligues vérifiées via
[`openfootball/football.json`](https://github.com/openfootball/football.json) (CC0).
Effectifs récents contrôlés via [`football-data.org`](https://www.football-data.org/).
Palmarès issu des historiques officiels des sept ligues suivies et de l'UEFA, liens détaillés ci-dessus.
Comptes annuels issus de la DNCG/LFP et de Companies House, document source conservé par ligne.
Projet non affilié à Transfermarkt.
