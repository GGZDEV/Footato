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

## Démarrer

```bash
npm install
npm run data     # télécharge les CSV sources puis construit le jeu de données
npm run dev
```

`npm run build` produit un site statique dans `dist/` (aucun serveur nécessaire).

## Les données

**Source : Transfermarkt**, via le jeu de données ouvert
[`ewenme/transfers`](https://github.com/ewenme/transfers), qui publie les pages de transferts
de Transfermarkt en CSV, un fichier par championnat.

| | |
|---|---|
| Couverture | **1992/93 → 2022/23** (extensible à 2023/24 et au-delà, voir plus bas) |
| Championnats | Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie, Premier Liga (Russie), Championship |
| Volume | 177 412 mouvements · 413 clubs · 9 951 mercatos |
| Devise | euros, montants tels que publiés par Transfermarkt |

Le site s'ouvre par défaut sur **2000/01 → 2022/23**, la plage disponible à l'intérieur de
la période demandée.

### Les saisons 2023/24 et suivantes : un import à faire une fois

Le jeu de base (`ewenme/transfers`) s'est arrêté en avril 2023, sa dernière saison complète
est **2022/23**. C'est aussi le cas de l'autre miroir Transfermarkt public
(`JaseZiv/worldfootballR_data`, archivé) : l'écosystème open data autour de Transfermarkt
s'est largement éteint en 2023.

Une source reste vivante et **mise à jour chaque semaine** :
[`dcaribou/transfermarkt-datasets`](https://github.com/dcaribou/transfermarkt-datasets).
Ses données ne sont pas dans Git (elles sont derrière DVC/Cloudflare R2), mais elles sont
publiées en téléchargement direct. `scripts/import-recent.mjs` les convertit vers le schéma
de ce projet.

```bash
# 1. Récupérer l'archive publiée (aucun compte requis)
curl -L -o tm.zip https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.zip
unzip tm.zip -d tm            # doit contenir transfers.csv, clubs.csv, competitions.csv
#    (alternative : https://www.kaggle.com/datasets/davidcariboo/player-scores)

# 2. Convertir et reconstruire
npm run data:recent -- --from ./tm     # --since 2023 par défaut
npm run data:build
```

Les lignes importées atterrissent dans `data/raw/recent/` et sont fusionnées avec la base
sans l'écraser : `--since 2023` garantit qu'il n'y a ni doublon ni recouvrement. Rejouez ces
deux commandes quand vous voulez rafraîchir — l'amont est réactualisé chaque semaine.

**Deux différences de méthode sur les saisons importées**, à connaître :

- **Prêts et transferts libres ne sont pas distingués.** L'amont ramène les deux à 0 €. Ces
  mouvements apparaissent donc sous « Libre ou prêt » au lieu d'être séparés. Les montants
  d'achats, de ventes et de bilan restent exacts — seule la ventilation par type est plus
  grossière. Les indemnités de prêt, elles, sont perdues (elles valent 0 dans cette source).
- **La fenêtre est déduite de la date** du transfert : juin à septembre pour le mercato
  d'été, le reste pour celui d'hiver. La source ne publie pas le drapeau de fenêtre.

Le périmètre est celui des clubs des championnats couverts : un transfert vers ou depuis un
club hors périmètre compte bien pour le club couvert, et est ignoré pour l'autre.

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

Les montants sont stockés en **milliers d'euros entiers**, donc les sommes sont exactes
(pas d'arrondi flottant accumulé). Chaque mouvement est classé par type :

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
scripts/fetch-source.mjs    télécharge les CSV de base dans data/raw/
scripts/import-recent.mjs   convertit les saisons récentes dans data/raw/recent/
scripts/build-dataset.mjs   agrège les CSV -> public/data/
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
[`ewenme/transfers`](https://github.com/ewenme/transfers). Projet non affilié à Transfermarkt.
