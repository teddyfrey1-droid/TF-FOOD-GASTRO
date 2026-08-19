# Questions métier

> Ce document a été **entièrement repris** après le recadrage des
> spécifications. Les questions qui portaient sur le calculateur à paliers, les
> formats GN et le temps de préparation n'ont plus lieu d'être.

## ✅ Tranché

| Sujet | Décision |
|---|---|
| Modèle de cible | `base_qty` (« VENTE POUR ») × multiplicateur × (CA / référence) |
| `conso/1000` | **ignorée** — c'est la base divisée par deux, elle fausse le minimum |
| Arrondis | à l'**entier supérieur** pour tout ce qui est visé ou produit ; demis au comptage seulement |
| Minimum | `auto` (cible / 2 par défaut) ou `manual`, réglable par produit |
| Priorité | **1 = le plus urgent**, 5 = le moins. Tous à 3 en attendant |
| Formats GN | retirés — l'unité se dit « gastro » ou « pièce » |
| Temps de prépa | retiré de la logique et de l'UI, colonne conservée en base |
| DLC | stockée dans `shelf_life_label`, aucune logique |
| Découpage midi / soir du CA | inutile : le comptage du lendemain matin ferme le service du soir |
| Temps de prépa par gastro | sans objet, la fonctionnalité est retirée |

## ⚠️ Deux points signalés, à confirmer

### 1. La marge de sécurité est passée à 0

Le modèle précédent ajoutait 10 % au chiffre d'affaires avant de calculer les
cibles. Le nouveau multiplicateur de famille (× 2 pour la mise en place) porte
déjà cette sécurité.

Si la marge était restée à 10 %, un chiffre d'affaires de 4 000 € serait entré
dans le calcul à 4 400 € et aurait donné **11 gastros de saumon au lieu des 10**
de votre tableau de contrôle. Elle est donc réglée à **0**, et reste modifiable
dans *Chiffre d'affaires → Réglages*.

**À confirmer :** voulez-vous conserver une marge par-dessus le × 2 ?

### 2. Le plafond de cible et l'arrondi

La cible est bornée **puis** arrondie à l'entier supérieur. Un plafond de 9,5
deviendrait donc 10, soit au-dessus du plafond.

**À confirmer :** les plafonds seront-ils toujours saisis en nombres entiers ?
Si oui, le cas ne se présente jamais.

## Reste à fournir

1. L'**historique du chiffre d'affaires** de l'an dernier, jour par jour.
   En attendant, la prévision se saisit à la main dans le calendrier.
2. Les **priorités réelles** — un clic par produit dans le tableau.
3. Les **planchers et plafonds** par produit, laissés vides.
