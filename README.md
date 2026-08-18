# MEP — Mise En Place

Application de gestion des stocks de mise en place du restaurant **Heiko Poké Bowl**,
76 rue La Fayette, Paris 9e.

L'application répond à une seule question, deux fois par jour :
**« qu'est-ce qu'on relance ? »**

---

## 1. Comment ça marche, en français

### Le principe

Chaque produit a deux nombres :

- une **cible** — le stock qu'on devrait avoir, calculée à partir du chiffre
  d'affaires prévu du jour ;
- un **seuil de relance** — le plancher sous lequel il faut reproduire.

L'employé compte ce qu'il reste. L'application compare, et dit quoi relancer.

**Exemple.** Le matin, la cible du saumon est de 8 gastros, avec un seuil de 4.
Après le service du midi il n'en reste que 3 : on est passé sous le seuil, donc
l'application affiche **« Saumon : relancer 5 gastros »** pour revenir à 8.
S'il en restait 5, on serait au-dessus du seuil : **rien à faire**, le saumon
n'apparaît même pas dans la liste.

C'est ce seuil qui rend le rapport lisible. Sans lui, l'application réclamerait
un demi-gastro dès qu'il manque un demi-gastro.

### Tout se compte en gastros

Jamais en kilos, jamais en portions. Les quantités vont de demi-gastro en
demi-gastro : 0 — 0,5 — 1 — 1,5 — 2… La saisie se fait aux boutons `−` et `+`,
sans clavier. Chaque produit affiche son **format GN** de référence, pour qu'un
gastro de saumon ne soit jamais confondu avec un gastro de grenade.

### Saladbar et frigo

L'employé compte les deux zones séparément — la vitrine réfrigérée en haut, la
réserve en bas — et l'application fait l'addition. C'est le **total** qui est
comparé au seuil et à la cible.

### Les deux comptages

- **Le matin**, avant l'ouverture : la mise en place de la journée.
- **L'après-midi**, après le rush du midi : ce qui a été consommé, et ce qu'il
  faut relancer pour le soir.

Par défaut la cible est **la même aux deux moments** : on remet simplement à
niveau. Un réglage permettra plus tard de l'abaisser le soir si on constate de
la surproduction.

---

## 2. Le calcul, étape par étape

### Étape 1 — Le chiffre d'affaires prévu du jour

On regarde ce qu'a fait le restaurant **le même jour de la semaine, la même
semaine, l'an dernier**. Pas la même date : le même jour de semaine. Un mardi se
compare à un mardi.

```
CA prévu = CA de l'an dernier × (1 + taux de croissance) × coefficient du jour
```

Le **coefficient** est un réglage manuel pour les cas particuliers : jour férié,
vacances scolaires, météo, travaux, événement dans le quartier. Il vaut 1 par défaut.

Si le jour de référence de l'an dernier était un jour de fermeture, on remonte au
même jour de la semaine précédente. Le directeur peut aussi écraser la prévision
d'une journée à la main.

### Étape 2 — Le chiffre d'affaires de référence

On ajoute une **marge de sécurité** (10 % par défaut) : mieux vaut un peu trop
que la rupture.

```
Matin      : CA de référence = CA prévu × 1,10
Après-midi : CA de référence = CA prévu × 1,10 × coefficient de l'après-midi (1,0 par défaut)
```

### Étape 3 — La cible de chaque produit

Deux manières de la calculer, au choix, produit par produit :

- **par paliers** : « entre 2 500 € et 4 000 € de CA, il faut 8 gastros de saumon » ;
- **par ratio** : « il faut 2,5 gastros de saumon pour 1 000 € de CA ».

La cible est ensuite bornée par un **plancher** (on ne descend jamais en dessous,
même un jour creux) et un **plafond** (la capacité du frigo), puis arrondie au
demi-gastro supérieur.

### Étape 4 — Le seuil de relance

Soit un pourcentage de la cible (50 % par défaut), soit une valeur fixe en
gastros. Le seuil est arrondi au demi-gastro le plus proche et **ne peut jamais
dépasser la cible**.

### Étape 5 — La décision

```
stock total = saladbar + frigo

Si stock total ≥ seuil  →  rien à faire, le produit n'apparaît pas
Sinon                   →  relancer (cible − stock total), arrondi au demi-gastro supérieur
```

Attention : **au seuil exactement, on ne relance pas.** Il faut être passé
*sous* le seuil.

### Étape 6 — L'ordre du rapport

Les produits les plus urgents d'abord (niveau d'urgence de 1 à 5), puis les plus
dégarnis. Un badge rouge **« RUPTURE IMMINENTE »** signale un produit tombé à
zéro, ou un produit urgent dont il reste moins d'un quart de la cible.

Le rapport affiche le **temps de préparation total estimé**, compté par gastro
entier : 5 gastros de saumon à 6 minutes le gastro font 30 minutes.

### Ce qui protège l'historique

Au moment où un comptage est validé, la cible, le seuil et la quantité à
relancer sont **figés** sur chaque ligne. Modifier un ratio le mois prochain
change les cibles du jour même, mais ne réécrit jamais ce qui s'est passé le
mois dernier.

---

## 3. Le parcours de l'employé

1. **Connexion** par e-mail et mot de passe. La session reste ouverte : on ne
   se reconnecte pas tous les matins.
2. **Accueil** : la date, son prénom, et deux cartes — « Comptage du matin » et
   « Comptage de l'après-midi » — avec leur état (*à faire*, *en cours*,
   *fait à 08h42 par Karim*). Aucun chiffre d'affaires, aucun graphique.
3. **Comptage** : les produits groupés par catégorie, une barre de recherche
   collante en haut, et pour chaque produit deux compteurs côte à côte —
   **saladbar** et **frigo** — aux boutons `−` et `+`. Le total s'affiche en
   gras à droite, recalculé en direct. Un appui long sur la valeur ouvre le
   pavé numérique pour les grosses quantités. Une barre indique
   « 14 / 32 produits comptés ».
4. **Validation** : le bouton ne s'active que lorsque tous les produits sont
   renseignés. Un produit manquant se marque « absent » avec son motif, qui est
   conservé.
5. **Rapport** : la liste de ce qu'il faut relancer, la plus urgente en premier,
   avec la quantité en gastros, le format GN, une pastille de couleur et la note
   du produit. On coche au fur et à mesure. Les produits au-dessus de leur seuil
   sont regroupés dans un bloc replié, discret. Si rien n'est à relancer :
   « Tout est au niveau. Rien à relancer. »

Le comptage du jour est un **travail d'équipe** : si Karim commence le matin et
part, Sofia peut reprendre là où il s'est arrêté. Une fois validé, un comptage
n'est plus modifiable — il devient une pièce d'historique.

### Rien n'est jamais perdu

Chaque saisie est écrite sur le téléphone avant d'être envoyée. En cas de
coupure réseau — chambre froide, sous-sol — un bandeau discret affiche
« Hors ligne — 12 saisies en attente », et tout repart automatiquement au
retour du réseau, même si l'application a été fermée entre-temps. La validation
attend toujours que la file soit vide : le rapport ne peut pas être calculé sur
un comptage incomplet.

---

## 4. Ce que le directeur peut regarder

- **Tableau de bord** : le CA prévisionnel du jour, l'état des deux comptages,
  et un rappel tant que des données provisoires traînent en base.
- **Historique** : tous les comptages sur une période, filtrables par session et
  par employé. Le détail d'un comptage montre saladbar / frigo / total, **la
  cible et le seuil tels qu'ils étaient ce jour-là**, la relance demandée et
  celle réellement cochée.
- **Anomalies** : session manquante, comptage validé en moins de deux minutes,
  variation d'un facteur 3 par rapport à la veille, produit tombé à zéro
  (rupture avérée), et produit jamais passé sous son seuil en dix comptages
  (cible probablement trop haute).
- **Consommation réelle** : combien de gastros partent réellement au service du
  midi, pour 1 000 € de chiffre d'affaires, face au ratio théorique du
  calculateur. Un bouton permet d'appliquer le ratio constaté.
- **Exports CSV** : la période complète ou une session précise, au format que
  votre Excel français ouvre sans rien reformater.

> La consommation réelle a besoin des **deux** comptages validés le même jour
> **et** du CA du midi saisi. Sans le CA du midi, la colonne reste vide.

---

## 5. Qui voit quoi

| | Employé | Directeur / Propriétaire |
|---|---|---|
| Liste des produits à compter | ✅ | ✅ |
| Liste de ce qu'il faut relancer | ✅ | ✅ |
| Chiffre d'affaires, prévisions | ❌ | ✅ |
| Ratios du calculateur | ❌ | ✅ |
| Cibles et seuils | ❌ | ✅ |
| Historique complet, exports | ❌ | ✅ |

**Cette séparation est appliquée dans la base de données, pas seulement dans
l'affichage.** Un employé qui ouvrirait les outils de développement de son
téléphone et forgerait une requête à la main ne recevrait rien. C'est vérifié
automatiquement par une cinquantaine de tests de sécurité (voir §6).

---

## 6. Installation

### Prérequis

- Node.js 20 ou plus
- `pnpm`
- Un projet [Supabase](https://supabase.com)

### Mise en route

```bash
pnpm install
cp .env.example .env.local   # puis remplir les valeurs
```

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique. Visible dans le navigateur : c'est normal, la RLS fait la sécurité |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé d'administration. **Contourne la RLS**, serveur uniquement |
| `SUPABASE_DB_URL` | Connexion directe, pour les migrations et la génération des types |

### Base de données

```bash
supabase link --project-ref <ref-du-projet>
supabase db push          # applique supabase/migrations/
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # jeu de démonstration (facultatif)
```

### Développement

```bash
pnpm dev          # http://localhost:3000
pnpm build        # build de production
pnpm typecheck    # vérification TypeScript
```

---

## 7. Comptes et rôles

Trois rôles : `employee`, `manager`, `owner`.

Tout compte créé naît **employé**. Seul un directeur ou le propriétaire peut le
promouvoir, depuis le back-office — un employé ne peut pas se promouvoir
lui-même, la base le refuse.

Pour créer le premier compte administrateur, après inscription :

```sql
update public.profiles set role = 'owner' where id = '<uuid du compte>';
```

---

## 8. Tests

Le cœur métier est testé deux fois, parce qu'il existe en deux exemplaires :
en TypeScript (pour le simulateur du back-office) et en SQL (pour la validation
d'un comptage). Les deux doivent donner exactement le même résultat.

```bash
pnpm test       # 117 tests TypeScript : calcul, steppers, anomalies, CSV
pnpm db:test    # tests SQL : calcul, sécurité RLS, journal d'audit
```

`pnpm db:test` rejoue le schéma complet sur une base Postgres neuve, puis lance
les tests. Il ne demande pas Docker ; il lui faut un serveur Postgres accessible
(`PGHOST`, `PGPORT`, `PGUSER`).

Sont notamment couverts :

- le tableau de vérification du cahier des charges (saumon 8/4 : stock 3 →
  relancer 5 ; stock 4 et 5 → rien ; stock 0 → 8 ; grenade 2/1 : stock 0,5 →
  relancer 1,5) ;
- l'alignement sur le jour de semaine de l'an dernier, sur 365 jours d'affilée ;
- les arrondis au demi-gastro, sans dérive de calcul ;
- le cas « stock exactement égal au seuil » (ne déclenche pas) ;
- le cas « seuil supérieur à la cible » (borné à la cible) ;
- le fait qu'un employé ne reçoive **aucune** ligne de chiffre d'affaires, de
  calculateur, de cible ou de seuil ;
- le fait que modifier un ratio change les cibles du jour sans altérer
  l'historique.

---

## 9. Organisation du code

```
src/lib/mep/          Le calcul métier, pur et sans base de données
                        rounding    arrondis au demi-gastro
                        isoWeek     jour de semaine de l'an dernier
                        forecast    prévision de CA
                        targets     cible et seuil
                        reorder     décision de relance et tri du rapport
                        consumption consommation réelle du midi
src/lib/admin/        Lectures du back-office et simulateur
src/lib/supabase/     Connexion à la base (navigateur, serveur, administration)
src/app/              Pages : connexion, accueil, comptage, back-office
src/components/admin/ Écrans du back-office
supabase/migrations/  Schéma versionné
supabase/tests/       Tests SQL (calcul, sécurité, audit)
tests/                Tests TypeScript
scripts/              Imports CSV et rejeu de la base
```

---

## 10. Charger vos données

### Le calculateur

Exportez le Google Sheet en CSV, puis :

```bash
pnpm import:calculateur --file data/calculateur.csv --dry-run   # simulation
pnpm import:calculateur --file data/calculateur.csv             # pour de vrai
```

`--dry-run` lit le fichier, signale les produits introuvables, les valeurs qui
ne tombent pas sur un demi-gastro et les trous entre tranches de CA — sans rien
écrire. Modèle de fichier : `data/calculateur.example.csv`.

L'import est **versionné** : les anciennes règles sont closes à la veille, pas
effacées. Ajoutez `--date 2026-09-01` pour faire entrer un nouveau calculateur
en vigueur à une date précise.

### Le chiffre d'affaires

```bash
pnpm import:ca --file data/ca-n-1.csv --dry-run
pnpm import:ca --file data/ca-n-1.csv
pnpm import:ca --file data/ca-2026.csv --actuals   # le CA réel de cette année
```

Modèle : `data/ca-n-1.example.csv`. Les dates sont acceptées en `2025-08-19`
comme en `19/08/2025`, et les montants en `3 200,50` comme en `3200.50`.

Les deux scripts sont **ré-exécutables** : relancer le même fichier ne crée pas
de doublon.

> Les fichiers `data/*.csv` ne sont pas versionnés dans Git — ce sont vos
> données commerciales. Seuls les modèles `*.example.csv` le sont.

---

## 11. État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 0 | Fondations : schéma, RLS, tests de sécurité, seed, authentification | ✅ |
| 1 | Back-office : produits, calculateur, simulateur, CA, imports CSV | ✅ |
| 2 | Parcours employé : comptage aux steppers, rapport de relance | ✅ |
| 3 | Historique, exports, consommation réelle, détection d'anomalies | ✅ |
| 4 | PWA : installation iOS, mode hors ligne, rappels, impression | à venir |

**Hors périmètre de la version 1 :** la gestion des DLC et la production en
avance pour le lendemain.

---

## 12. Données encore à fournir

Le jeu de démonstration contient des valeurs **provisoires**, signalées par la
mention « à confirmer » à côté de chaque format GN. Elles ne doivent pas servir
en production. Il reste à fournir :

1. l'export du Google Sheet du calculateur (produits × tranches de CA) ;
2. le chiffre d'affaires jour par jour de l'an dernier ;
3. les formats GN réels de chaque produit ;
4. les seuils de relance et niveaux d'urgence par produit.

Voir `docs/questions-metier.md` pour le détail.
