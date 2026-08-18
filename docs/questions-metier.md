# Questions métier — à répondre avant la phase 1

La phase 0 (fondations) est terminée et ne dépendait d'aucune de ces réponses :
le schéma, la sécurité et le moteur de calcul sont neutres vis-à-vis des valeurs
réelles. En revanche **le back-office et le calculateur (phase 1) ont besoin de
ces réponses** pour être calibrés.

Tout ce qui est aujourd'hui en base est **provisoire** et signalé comme tel.

---

## 1. Le calculateur actuel (le Google Sheet)

C'est la donnée la plus importante. Il me faut l'export CSV du Sheet, tel quel.

**Questions :**

- Combien de tranches de CA comporte-t-il, et quelles sont leurs bornes exactes ?
  (le seed utilise pour l'instant : 0–1 500 / 1 500–2 500 / 2 500–4 000 /
  4 000–5 500 / 5 500 et plus)
- Une tranche s'écrit-elle « de 2 500 inclus à 4 000 exclu » ? C'est ce que
  j'ai implémenté ; si le Sheet raisonne autrement, dites-le-moi.
- Le CA du Sheet est-il **HT ou TTC** ? Toute la base est en HT.
- Les valeurs du Sheet sont-elles déjà en gastros, ou en kilos / portions ?
- Certains produits fonctionnent-ils mieux **au ratio** (« X gastros pour
  1 000 € ») qu'aux paliers ?

Format attendu :

```
Produit ; Format GN ; CA 0-1500 ; CA 1500-2500 ; CA 2500-4000 ; ...
Saumon  ; GN 1/3 - 65mm ; 3 ; 5 ; 8 ; ...
```

---

## 2. Le chiffre d'affaires de l'an dernier

```
date ; ca_ht ; ferme(0/1)
2025-01-02 ; 2840.00 ; 0
```

**Questions :**

- Sur quelle profondeur ? (12 mois glissants suffisent pour démarrer)
- Le CA est-il découpé **midi / soir** ? Le calcul de la consommation réelle
  (§5.7 du cahier des charges) a besoin du CA du midi seul pour être exploitable.
  Sans lui, l'analyse de recalibrage sera moins précise.
- Quel **taux de croissance** appliquer par rapport à l'an dernier ?
  (le cahier des charges cite +10 % en exemple, la base est à 0 % pour l'instant)

---

## 3. Les formats GN par produit

Le format s'affiche à l'écran de comptage : c'est lui qui lève l'ambiguïté
« un gastro de quoi ». Les 35 produits du seed portent tous un format
**provisoire**, suffixé « (à confirmer) ».

**Question :** le format réel pour chaque produit — par exemple
`GN 1/3 - 65mm`, `GN 1/6 - 100mm`.

Un même produit peut-il exister dans deux formats différents (un grand bac au
frigo, un petit au saladbar) ? Le modèle actuel suppose **un seul format de
référence par produit** ; si ce n'est pas le cas, il faut me le dire maintenant,
cela change le comptage.

---

## 4. Seuils de relance et niveaux d'urgence

Faute d'information, le seed applique les valeurs par défaut prévues au §9.3 :
**seuil = 50 % de la cible**, et j'ai réparti les urgences à la main selon le
coût et la vitesse de rotation (poissons et avocat à 5, toppings décoratifs à 1).

**Questions :**

- Pour quels produits le seuil doit-il être une **valeur fixe** plutôt qu'un
  pourcentage ? (typiquement le saumon : « on relance dès qu'on passe sous
  4 gastros », quel que soit le CA)
- Le niveau d'urgence de 1 à 5 de chaque produit. C'est lui qui pilote l'ordre
  du rapport : ce que l'employé fera en premier.
- Le **plancher** de cible (« on ne descend jamais sous X gastros de saumon,
  même un lundi creux ») et le **plafond** (capacité du frigo) par produit.

---

## 5. Deux points du cahier des charges à trancher

### 5.1 Le temps de préparation — contradiction dans le §5.6

Le cahier des charges décrit `prep_time_min` comme le **temps de prépa par
gastro**, mais donne la formule :

```
Σ besoin / production_step × prep_time_min
```

qui compte le nombre de **pas de production**. Avec un pas de 0,5 gastro, les
deux lectures diffèrent d'un facteur 2 : pour 5 gastros de saumon à 6 minutes,
c'est soit 30 minutes, soit 60.

J'ai implémenté **la formule telle qu'elle est écrite** (60 minutes), et isolé
le choix dans une constante `PREP_TIME_BASIS` (`src/lib/mep/reorder.ts`) pour
pouvoir basculer en une ligne.

**Question :** 6 minutes, c'est le temps pour préparer un gastro entier, ou un
demi-gastro ?

### 5.2 Le plafond de cible et l'arrondi

Le §5.3 impose de borner la cible **puis** de l'arrondir au demi-gastro
supérieur. Un plafond de 8,2 gastros deviendrait donc 8,5 — au-dessus du
plafond. J'ai respecté l'ordre du cahier des charges.

**Question :** je confirme que les plafonds (capacité frigo) seront toujours
saisis en multiples de 0,5 ? Si oui, le cas ne se présente jamais et il n'y a
rien à changer.

---

## 6. Organisation du restaurant

- Combien d'employés auront un compte ? (pour préparer les créations)
- Le restaurant ferme-t-il certains jours de la semaine, ou certaines périodes
  (vacances, jours fériés) ?
- À quelle heure se font les deux comptages ? Les rappels sont réglés à 7 h 30
  et 15 h 00 par défaut.
- Un produit peut-il être **absent du saladbar** et présent uniquement au frigo,
  ou l'inverse ? Le modèle le gère (`in_saladbar` / `in_fridge`), mais j'ai
  besoin de la liste réelle.
