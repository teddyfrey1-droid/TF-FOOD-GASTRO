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
Le rapport affiche le temps de préparation total estimé.

### Ce qui protège l'historique

Au moment où un comptage est validé, la cible, le seuil et la quantité à
relancer sont **figés** sur chaque ligne. Modifier un ratio le mois prochain
change les cibles du jour même, mais ne réécrit jamais ce qui s'est passé le
mois dernier.

---

## 3. Qui voit quoi

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

## 4. Installation

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

## 5. Comptes et rôles

Trois rôles : `employee`, `manager`, `owner`.

Tout compte créé naît **employé**. Seul un directeur ou le propriétaire peut le
promouvoir, depuis le back-office — un employé ne peut pas se promouvoir
lui-même, la base le refuse.

Pour créer le premier compte administrateur, après inscription :

```sql
update public.profiles set role = 'owner' where id = '<uuid du compte>';
```

---

## 6. Tests

Le cœur métier est testé deux fois, parce qu'il existe en deux exemplaires :
en TypeScript (pour le simulateur du back-office) et en SQL (pour la validation
d'un comptage). Les deux doivent donner exactement le même résultat.

```bash
pnpm test       # 69 tests TypeScript sur toute la logique de calcul
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

## 7. Organisation du code

```
src/lib/mep/          Le calcul métier, pur et sans base de données
                        rounding    arrondis au demi-gastro
                        isoWeek     jour de semaine de l'an dernier
                        forecast    prévision de CA
                        targets     cible et seuil
                        reorder     décision de relance et tri du rapport
                        consumption consommation réelle du midi
src/lib/supabase/     Connexion à la base (navigateur, serveur, administration)
src/app/              Pages : connexion, accueil, comptage, back-office
supabase/migrations/  Schéma versionné
supabase/tests/       Tests SQL (calcul, sécurité, audit)
tests/                Tests TypeScript
scripts/db-test.sh    Rejoue schéma + seed + tests
```

---

## 8. État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 0 | Fondations : schéma, RLS, tests de sécurité, seed, authentification | ✅ |
| 1 | Back-office : produits, calculateur, simulateur, CA, imports CSV | à venir |
| 2 | Parcours employé : comptage aux steppers, rapport de relance | à venir |
| 3 | Historique, exports, consommation réelle, détection d'anomalies | à venir |
| 4 | PWA : installation iOS, mode hors ligne, rappels, impression | à venir |

**Hors périmètre de la version 1 :** la gestion des DLC et la production en
avance pour le lendemain.

---

## 9. Données encore à fournir

Le jeu de démonstration contient des valeurs **provisoires**, signalées par la
mention « à confirmer » à côté de chaque format GN. Elles ne doivent pas servir
en production. Il reste à fournir :

1. l'export du Google Sheet du calculateur (produits × tranches de CA) ;
2. le chiffre d'affaires jour par jour de l'an dernier ;
3. les formats GN réels de chaque produit ;
4. les seuils de relance et niveaux d'urgence par produit.

Voir `docs/questions-metier.md` pour le détail.
