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

## Démarrer

```bash
npm install
npm run data     # télécharge les CSV sources puis construit le jeu de données
npm run dev
```

`npm run build` produit un site statique dans `dist/` (aucun serveur nécessaire).

## Les données

Le pipeline combine deux instantanés dérivés de **Transfermarkt** et une source de contrôle :

- [`ewenme/transfers`](https://github.com/ewenme/transfers) pour l'historique typé
  (transfert libre, prêt, indemnité de prêt, fin de prêt) jusqu'en 2022/23 ;
- [`dcaribou/transfermarkt-datasets`](https://github.com/dcaribou/transfermarkt-datasets)
  pour les saisons maintenues et révisées régulièrement ;
- [`openfootball/football.json`](https://github.com/openfootball/football.json) pour vérifier,
  indépendamment des transferts, la composition des championnats de la saison en cours.

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
4. déduplique, agrège, puis vérifie chaque agrégat contre les mouvements détaillés.

La validation ne se limite pas au nombre de lignes : elle recalcule indépendamment les montants,
les indemnités de prêt, chaque catégorie de mouvement, les arrivées et les départs depuis les
193 756 mouvements détaillés. Une seconde suite exerce les filtres, les quatre regroupements,
les tris et les quatre modes du graphique sur près de 200 scénarios.

Le workflow GitHub Actions rejoue ce pipeline à chaque déploiement et chaque lundi. Une source
vieille de plus de 45 jours fait échouer la validation au lieu d'être publiée silencieusement.

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
| Montant non divulgué (`?`, `-`) | non (0 €), compté dans les arrivées/départs |
| Libre ou prêt (saisons importées) | non (0 €), compté dans les arrivées/départs |

**Conséquence à garder en tête : les totaux sont des planchers.** Environ la moitié des
mouvements n'ont pas de montant public — ils comptent pour 0 €. La proportion de transferts
effectivement chiffrés est affichée en permanence dans la tuile « Périmètre ».

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
public/data/summary.json    championnats, clubs, un agrégat par club × saison × fenêtre (~0,5 Mo)
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
Projet non affilié à Transfermarkt.
