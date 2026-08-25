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
| Couverture | **1992/93 → 2022/23** |
| Championnats | Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie, Premier Liga (Russie), Championship |
| Volume | 177 412 mouvements · 413 clubs · 9 951 mercatos |
| Devise | euros, montants tels que publiés par Transfermarkt |

Le site s'ouvre par défaut sur **2000/01 → 2022/23**, la plage disponible à l'intérieur de
la période demandée.

### ⚠️ Les saisons 2023/24 à 2026/27 ne sont pas couvertes

Le dépôt source n'a plus été mis à jour depuis avril 2023 : sa dernière saison complète est
**2022/23**. Transfermarkt n'est pas interrogeable directement depuis ce projet (et son scraping
est contraire à ses conditions d'utilisation), donc ces quatre saisons manquent.

Pour les ajouter, deux chemins :

1. **Une mise à jour en amont** — si `ewenme/transfers` reprend, un `npm run data` suffit à
   récupérer les nouvelles saisons ; rien d'autre à changer.
2. **Vos propres données** — `scripts/build-dataset.mjs` lit *tous* les CSV listés dans
   `data/raw/`, quelle que soit leur provenance, dès lors qu'ils respectent le schéma ci-dessous.
   Ajoutez vos lignes aux fichiers existants et relancez `npm run data:build`.

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
scripts/fetch-source.mjs    télécharge les CSV dans data/raw/
scripts/build-dataset.mjs   agrège les CSV -> public/data/
public/data/summary.json    championnats, clubs, un agrégat par club × saison × fenêtre (~0,5 Mo)
public/data/windows/*.json  les mouvements de chaque fenêtre, chargés à la demande
src/lib/                    types, agrégation, filtres, formatage
src/components/             filtres, tuiles, graphiques, tableau, panneau de détail
```

`summary.json` est chargé au démarrage (tout le tri et le filtrage se font côté client, sans
requête réseau) ; les fichiers `windows/` ne sont téléchargés qu'à l'ouverture d'un mercato.

## Déploiement

Un workflow GitHub Actions (`.github/workflows/deploy.yml`) publie le site sur GitHub Pages à
chaque push sur la branche par défaut. Activez Pages sur le dépôt avec la source
**GitHub Actions**. Pour un autre hébergement, `npm run build` puis servez `dist/`.

## Licence et attribution

Données © [Transfermarkt](https://www.transfermarkt.com/), agrégées via
[`ewenme/transfers`](https://github.com/ewenme/transfers). Projet non affilié à Transfermarkt.
