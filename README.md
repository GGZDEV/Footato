# ⚽ Footato

Récapitulatif des **montants de transferts du football européen**, mercato par mercato :
pour chaque club et chaque fenêtre, les **achats**, les **ventes** et le **bilan**.

Pas de fiches joueurs — le sujet, ce sont les flux d'argent : qui dépense, qui encaisse,
et ce qu'il reste à la fin de chaque mercato.

## Ce que fait le site

- **Tri sur toutes les colonnes** — achats, ventes, bilan, volume, nombre d'arrivées/départs.
- **Filtres combinables** — plage de saisons, fenêtre (été/hiver), championnat, club,
  bilan excédentaire ou déficitaire, volume minimum.
- **Quatre niveaux de lecture** — par mercato (club × fenêtre), par club, par championnat, par saison.
- **Détail d'un mercato** — cliquez une ligne : structure des mouvements (payants / libres / prêts /
  non divulgués), classement du club dans son championnat sur cette fenêtre, historique complet du
  club, et la liste des mouvements avec leurs montants.
- **Vue partageable** — chaque combinaison de filtres, tri et mercato ouvert a sa propre URL.
- **Export CSV** de la vue courante.
- **Graphique modulable** — total par saison, été seul, hiver seul ou deux fenêtres séparées.
- **Contrôle d'effectifs récent** — sept championnats et la Ligue des champions sont relevés
  automatiquement ; les changements détectés restent signalés à part jusqu'à confirmation.
- **Classements auditables** — top dépenses, bénéfices et ventes, avec la complétude des indemnités
  visible pour chaque ligne plutôt qu'un classement présenté comme exact à tort.
- **Dépenses comparées aux titres** — championnats de première division des sept pays et Ligue des
  champions, par saison, avec coût documenté par titre et gros dépensiers sans titre suivi.

## Démarrer

```bash
npm install
npm run data     # télécharge les CSV sources puis construit le jeu de données
npm run dev
```

`npm run build` produit un site statique dans `dist/` (aucun serveur nécessaire).

## Les données

Le pipeline combine deux instantanés dérivés de **Transfermarkt** et deux sources de contrôle :

- [`ewenme/transfers`](https://github.com/ewenme/transfers) pour l'historique typé
  (transfert libre, prêt, indemnité de prêt, fin de prêt) jusqu'en 2022/23 ;
- [`dcaribou/transfermarkt-datasets`](https://github.com/dcaribou/transfermarkt-datasets)
  pour les saisons maintenues et révisées régulièrement ;
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

Footato ne parle pas de « palmarès total » : seules les sept premières divisions suivies et la Ligue
des champions sont comparées. Les coupes nationales, supercoupes et autres compétitions sont exclues.
Les saisons sans champion ne sont pas transformées en zéro silencieux : Serie A 2004/05 (titre révoqué)
et Eredivisie 2019/20 (saison interrompue) sont explicitement documentées dans le catalogue.

Les championnats couverts sont la Premier League, LaLiga, Serie A, Bundesliga, Ligue 1,
Liga Portugal, Eredivisie, Premier Liga russe et Championship. La couverture
maximale de chaque championnat est publiée séparément dans `summary.json` : une saison n'est
jamais attribuée à un championnat par simple supposition.

### Actualiser tout le jeu de données

```bash
npm run data:refresh
```

Cette commande :

1. télécharge les trois sources avec trois tentatives, écriture atomique et empreinte SHA-256 ;
2. reconstruit l'appartenance `club × saison × championnat` depuis les matchs, puis exige une
   correspondance intégrale des clubs de la saison courante avec la source de contrôle ;
3. exclut les mouvements futurs et les couples saison/date incohérents ;
4. déduplique, agrège, puis vérifie chaque agrégat contre les mouvements détaillés ;
5. rattache chaque titre à l'identifiant stable du club et bloque la publication si le catalogue
   officiel et une saison disponible dans l'API désignent des vainqueurs différents.

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
- La source maintenue ramène les prêts, fins de prêt et transferts libres à 0 €. Les indemnités
  de prêt ne sont donc pas récupérables sur les saisons récentes avec cette source gratuite.
- La composition 2026/27 de la Premier Liga russe n'est pas fournie par la source de contrôle :
  les données russes s'arrêtent donc à 2025/26, sans extrapolation.
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

- Un mercato = **un club sur une fenêtre**. Un club relégué ou promu change de championnat
  d'une saison à l'autre : chaque ligne porte le championnat de la saison concernée.
- Un transfert entre deux clubs couverts apparaît une fois comme achat, une fois comme vente —
  ce sont deux clubs différents, il n'y a pas de double comptage.
- Le mercato d'hiver d'une saison se déroule en janvier de l'année civile suivante ; le site
  l'affiche sous la saison (`2022/23 · Hiver`) et le détail rappelle l'année réelle.

## Structure

```
scripts/fetch-source.mjs    télécharge, empreinte et date les sources dans data/raw/
scripts/import-recent.mjs   normalise les saisons récentes avec appartenance saisonnière
scripts/build-dataset.mjs   agrège les CSV -> public/data/
scripts/validate-dataset.mjs vérifie agrégats, détails, couverture et fraîcheur
scripts/sync-football-data.mjs relève les effectifs et détecte les changements
scripts/lib/honours-catalog.mjs catalogue officiel versionné et contre-vérifié des titres
public/data/summary.json    championnats, clubs, un agrégat par club × saison × fenêtre (~0,5 Mo)
public/data/freshness.json  dernier relevé d'effectifs et signaux séparés des agrégats
public/data/windows/*.json  les mouvements de chaque fenêtre, chargés à la demande
src/lib/                    types, agrégation, filtres, formatage
src/components/             filtres, tuiles, graphiques, tableau, panneau de détail
```

`summary.json` est chargé au démarrage (tout le tri et le filtrage se font côté client, sans
requête réseau) ; les fichiers `windows/` ne sont téléchargés qu'à l'ouverture d'un mercato.

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
Projet non affilié à Transfermarkt.
