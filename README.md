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

### Les deux comptages, les deux services

La journée se déroule ainsi :

```
comptage MATIN → production → SERVICE DU MIDI
  → comptage APRÈS-MIDI → production → SERVICE DU SOIR
    → (ce qui reste n'est pas jeté) → comptage du LENDEMAIN MATIN
```

Les deux comptages ne servent pas à faire des statistiques : ils servent à
**remettre le stock à niveau avant chaque service**, pour ne jamais tomber à
court de grenade ou d'avocat, ni au midi ni au soir.

Par défaut la cible est **la même aux deux moments** : on remet simplement à
niveau. Le réglage « coefficient de l'après-midi » permet de l'abaisser pour le
soir si celui-ci consomme moins — et l'application vous dit maintenant de
combien (voir §4).

Ce qui reste après le service du soir **n'est pas jeté** : il constitue la base
du lendemain. C'est ce qui rend la mesure de la consommation possible sans
aucun comptage supplémentaire.

---

## 2. Le calcul, étape par étape

### Étape 1 — Le chiffre d'affaires prévu du jour

Tout part de là, et c'est ce qui permet d'**anticiper la production** plutôt
que de la subir.

On regarde ce qu'a fait le restaurant **le même jour de la semaine, la même
semaine, l'an dernier**. Pas la même date : le même jour de semaine. Un jeudi
se compare à un jeudi — sans quoi on comparerait un jeudi de juin à un mercredi.

```
CA prévu = CA de l'an dernier × (1 + taux de croissance) × coefficient du jour
```

**Un exemple concret.** Le jeudi 26 juin 2025 a fait 2 000 €. Avec un taux de
croissance de +25 %, le jeudi 25 juin 2026 est estimé à **2 500 €**. Le
calculateur en déduit qu'il faut **6 gastros de saumon** au lieu des 5 qu'il
aurait fallu pour 2 000 €.

C'est tout l'intérêt : on prépare pour la journée qui vient, pas pour celle de
l'an dernier. On ne manque pas, et on ne gâche pas.

Le **coefficient** est un réglage manuel pour les cas particuliers : jour férié,
vacances scolaires, météo, travaux, événement dans le quartier. Il vaut 1 par défaut.

Si le jour de référence de l'an dernier était un jour de fermeture, on remonte au
même jour de la semaine précédente. Le directeur peut aussi écraser la prévision
d'une journée à la main.

### Le taux de croissance se règle sur du constaté

Ce taux décide, à lui seul, s'il faut 5 ou 6 gastros de saumon. Il se modifie
**à tout moment** dans le back-office et agit immédiatement sur les cibles du
jour — sans jamais toucher aux comptages déjà validés.

Et vous n'avez pas à le deviner. L'écran Chiffre d'affaires affiche côte à
côte :

- le **taux que vous avez réglé** ;
- le **taux réellement constaté**, obtenu en comparant chaque journée réalisée
  au même jour de semaine de l'an dernier.

Si l'écart est net, un bouton propose d'aligner l'un sur l'autre, en disant
lequel des deux risques vous courez :

> *Vous produisez pour un chiffre d'affaires plus bas que celui réellement
> réalisé : risque de manquer.* → **Régler sur +23 %**

Le calcul agrège les montants plutôt que de moyenner des pourcentages : un
samedi à 4 000 € pèse ainsi plus qu'un lundi à 300 €, et une journée creuse ne
fausse pas la conclusion.

### Étape 2 — Le chiffre d'affaires de référence

Une **marge de sécurité** peut être ajoutée, mais elle est réglée à **0 par
défaut** : le multiplicateur de famille (× 2 pour la mise en place) porte déjà
la sécurité. Sans cela, un chiffre d'affaires prévu de 4 000 € entrerait dans le
calcul à 4 400 € et donnerait 11 gastros de saumon au lieu des 10 attendus.

```
Matin      : CA de référence = CA prévu × (1 + marge)
Après-midi : CA de référence = CA prévu × (1 + marge) × coefficient de l'après-midi (1,0 par défaut)
```

### Étape 3 — La cible de chaque produit

Une seule donnée pilote un produit : sa valeur **« VENTE POUR »**, reprise du
Google Sheet. Tout le reste en découle.

```
cible = « VENTE POUR » × multiplicateur × (CA de référence / CA de la famille)
```

Chaque produit appartient à l'une des deux familles :

| Famille | Base exprimée pour | Multiplicateur | Compté en |
|---|---|---|---|
| **Mise en place** — protéines, ingrédients | 4 000 € | × 2 | gastros |
| **Les plus** — gyozas, baos, desserts | 1 000 € | × 1 | pièces |

**Exemple.** Le saumon a une base de 4,6. À 4 000 € :
4,6 × 2 × (4 000 / 4 000) = 9,2 → **cible 10 gastros**. À 5 000 € : 11,5 → **12**.

La cible est ensuite bornée par un plancher et un plafond éventuels, puis
**arrondie à l'entier supérieur**.

### Étape 4 — Le minimum de relance

Deux modes, réglables produit par produit et modifiables à tout moment :

- **Automatique** (par défaut) : le minimum vaut la **moitié de la cible**. Il
  suit donc le chiffre d'affaires tout seul, sans rien à régler. Un diviseur
  autre que 2 est possible.
- **Fixe** : une valeur en dur, que le chiffre d'affaires ne fait pas bouger.

Le minimum s'arrondit au demi supérieur et **ne dépasse jamais la cible**.
Saumon à 4 000 € : cible 10, minimum 5.

Le mode se bascule **en deux clics depuis le tableau des produits**, sans ouvrir
de fiche.

### Étape 5 — La décision

```
stock total = saladbar + frigo

Si stock total ≥ minimum  →  rien à faire, le produit n'apparaît pas
Sinon                     →  relancer (cible − stock total), à l'entier supérieur
```

Attention : **au minimum exactement, on ne relance pas.** Il faut être passé
*sous* le minimum.

### Les arrondis, en un mot

**Tout ce qui est produit ou visé s'arrondit à l'entier supérieur.** 9,2 donne
10, 4,1 donne 5, 4,0 reste 4. On ne produit jamais moins que nécessaire.

Seul le **comptage** accepte les demis : l'employé constate un stock réel, il
peut donc saisir 3,5 gastros.

> Le Google Sheet, lui, arrondit au plus proche — un Bao à 8,3 y devient 8.
> L'application monte à 9. C'est volontaire.

### Étape 6 — L'ordre du rapport

Chaque produit porte une **priorité de 1 à 5**, où **1 est le plus urgent** et
5 le moins. Le rapport place donc les priorités 1 en tête, puis, à priorité
égale, les produits les plus dégarnis.

| Priorité | Pastille |
|---|---|
| 1 — le plus urgent | 🔴 rouge |
| 2 | 🟠 orange |
| 3 | 🟡 jaune |
| 4 | 🔵 bleu |
| 5 — le moins urgent | ⚪ gris |

La priorité se modifie à tout moment, directement dans le tableau des produits.

Le rapport affiche le **temps de préparation total estimé**, compté par gastro
entier : 5 gastros de saumon à 6 minutes le gastro font 30 minutes.

### Étape 7 — Mesurer ce qui part réellement

Les comptages encadrent chaque service, donc la consommation se déduit sans
rien demander de plus à l'employé :

```
consommé au MIDI = (stock du matin      + produit le matin)      − stock d'après-midi
consommé au SOIR = (stock d'après-midi  + produit l'après-midi)  − stock du lendemain matin
```

La seconde ligne fonctionne **parce que les invendus du soir ne sont pas
jetés** : le stock du lendemain matin est exactement ce qui restait à la
fermeture. Voir §4.

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

Une page de comptage déjà ouverte reste utilisable sans réseau. Une page jamais
visitée affiche un écran « Pas de réseau » qui rappelle que les saisies en
cours sont conservées. À la déconnexion, ces pages mises en cache sont
effacées : le téléphone est parfois partagé.

---

## 4. Ce que le directeur peut regarder

- **Tableau de bord** : le CA prévisionnel du jour, l'état des deux comptages,
  et un rappel tant que des données provisoires traînent en base.
- **Chiffre d'affaires** : le taux de croissance réglé face au taux constaté,
  le calendrier du mois avec son coefficient par jour, et la saisie du réalisé.
- **Historique** : tous les comptages sur une période, filtrables par session et
  par employé. Le détail d'un comptage montre saladbar / frigo / total, **la
  cible et le seuil tels qu'ils étaient ce jour-là**, la relance demandée et
  celle réellement cochée.
- **Anomalies** : session manquante, comptage validé en moins de deux minutes,
  variation d'un facteur 3 par rapport à la veille, produit tombé à zéro
  (rupture avérée), et produit jamais passé sous son seuil en dix comptages
  (cible probablement trop haute).
- **Consommation réelle** : combien de gastros partent réellement à chaque
  service, midi et soir séparément, et ce que ça représente pour 1 000 € de
  chiffre d'affaires. Un bouton permet d'appliquer le ratio constaté au
  calculateur.
- **Exports CSV** : la période complète ou une session précise, au format que
  votre Excel français ouvre sans rien reformater.

### Comment la consommation est mesurée

Tout est mesuré, rien n'est estimé :

```
consommé au MIDI = (stock du matin      + produit le matin)      − stock d'après-midi
consommé au SOIR = (stock d'après-midi  + produit l'après-midi)  − stock du lendemain matin
```

Le service du soir se mesure grâce au **comptage du lendemain matin** : comme
les invendus ne sont pas jetés, ce qu'on retrouve le matin est exactement ce
qui restait à la fermeture. Aucun comptage supplémentaire n'est demandé à
personne.

L'écran affiche donc, produit par produit :

| Colonne | Ce qu'elle dit |
|---|---|
| **Midi** | gastros consommés au déjeuner, en moyenne |
| **Soir** | gastros consommés au dîner, en moyenne |
| **Soir / midi** | lequel des deux services consomme le plus |
| **Journée** | consommation totale pour 1 000 € de chiffre d'affaires |
| **Cible calculateur** | ce que le calculateur prévoit, pour comparaison |
| **Marge** | l'écart entre les deux |

> Une journée est entièrement mesurée quand elle a ses deux comptages validés,
> son chiffre d'affaires saisi, **et** le comptage du lendemain matin. La
> journée d'hier n'est donc complète qu'à partir de ce matin — c'est le nombre
> entre parenthèses dans la colonne « Jours ».

**Le coefficient de l'après-midi se règle tout seul.** L'écran vous dit
combien le soir consomme par rapport au midi. Si le soir ne fait que 70 % du
midi, vous pouvez abaisser le coefficient d'autant : les cibles du soir
baissent, et la surproduction avec. C'est mesuré, pas ressenti.

**Lire la colonne « Marge ».** C'est l'écart entre la cible du calculateur et
la consommation constatée. Une marge **positive** est normale : la cible
intègre volontairement de la sécurité. Une marge **négative** signale une cible
trop basse — on a consommé plus que prévu, donc frôlé la rupture.

---

## 5. Qui voit quoi

| | Employé | Directeur / Propriétaire |
|---|---|---|
| Liste des produits à compter | ✅ | ✅ |
| Liste de ce qu'il faut relancer | ✅ | ✅ |
| Chiffre d'affaires, prévisions | ❌ | ✅ |
| Valeurs « VENTE POUR » et familles | ❌ | ✅ |
| Cibles et minimums | ❌ | ✅ |
| Historique complet, exports | ❌ | ✅ |

Un employé qui connaîtrait à la fois la base d'un produit et sa cible pourrait
en déduire le chiffre d'affaires du restaurant. C'est pourquoi ni l'une ni
l'autre ne quitte jamais le serveur.

**Cette séparation est appliquée dans la base de données, pas seulement dans
l'affichage.** Un employé qui ouvrirait les outils de développement de son
téléphone et forgerait une requête à la main ne recevrait rien. C'est vérifié
automatiquement par une cinquantaine de tests de sécurité (voir §6).

---

## 6. Installer l'application sur son iPhone

1. Ouvrir l'adresse de l'application dans **Safari** (pas Chrome : sur iOS,
   seul Safari sait installer une application web).
2. Toucher le bouton **Partager** (le carré avec une flèche).
3. Choisir **« Sur l'écran d'accueil »**, puis **Ajouter**.

L'icône MEP apparaît alors avec les autres applications. Elle s'ouvre en plein
écran, sans barre d'adresse.

### Les rappels de comptage

Une fois l'application installée, un bouton **« Activer les rappels de
comptage »** apparaît sur l'écran d'accueil. Il envoie une notification si le
comptage n'a pas été fait à l'heure prévue (07 h 30 et 15 h 00 par défaut,
réglables dans le back-office).

Deux points à connaître :

- sur iPhone, les notifications ne fonctionnent **que** si l'application a été
  ajoutée à l'écran d'accueil — c'est une contrainte d'Apple, pas un choix ;
- côté serveur, il faut renseigner les clés VAPID et `CRON_SECRET` (voir
  `.env.example`) et brancher la tâche planifiée. Sans elles, le bouton ne
  s'affiche pas et le reste de l'application fonctionne normalement.

Génération des clés :

```bash
npx web-push generate-vapid-keys
```

La tâche planifiée est décrite dans `vercel.json`. Elle s'exécute toutes les
demi-heures dans une plage large, et c'est **la base de données** qui décide si
l'heure de Paris est venue — sans quoi les rappels se décaleraient d'une heure à
chaque changement d'heure d'été. Un verrou garantit un seul envoi par jour et
par session.

---

## 7. Installation (développeurs)

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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clé publique des notifications push (facultatif) |
| `VAPID_PRIVATE_KEY` | Clé privée des notifications push (facultatif) |
| `VAPID_SUBJECT` | Contact du responsable, ex. `mailto:directeur@heiko.fr` |
| `CRON_SECRET` | Protège `/api/rappels`. Sans lui, n'importe qui pourrait notifier l'équipe |

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

## 8. Comptes et rôles

Trois rôles : `employee`, `manager`, `owner`.

Tout compte créé naît **employé**. Seul un directeur ou le propriétaire peut le
promouvoir, depuis le back-office — un employé ne peut pas se promouvoir
lui-même, la base le refuse.

Pour créer le premier compte administrateur, après inscription :

```sql
update public.profiles set role = 'owner' where id = '<uuid du compte>';
```

---

## 9. Tests

Le cœur métier est testé deux fois, parce qu'il existe en deux exemplaires :
en TypeScript (pour le simulateur du back-office) et en SQL (pour la validation
d'un comptage). Les deux doivent donner exactement le même résultat.

```bash
pnpm test       # 139 tests TypeScript : calcul, croissance, steppers, consommation, CSV
pnpm db:test    # tests SQL : calcul, sécurité RLS, audit, comptage, rappels
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

## 10. Organisation du code

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
public/sw.js          Service worker : mode hors ligne et rappels
scripts/              Imports CSV, génération des icônes, rejeu de la base
```

---

## 11. Charger vos données

### Le référentiel produits

Exportez le Google Sheet en CSV, puis :

```bash
pnpm import:produits --file data/produits.csv --dry-run   # simulation
pnpm import:produits --file data/produits.csv             # pour de vrai
```

Seules deux colonnes sont obligatoires : **Produit** et **VENTE POUR**. Les
colonnes `DLC`, `Famille`, `Catégorie` et `Unité` sont reconnues si elles sont
présentes. Modèle de fichier : `data/produits.example.csv`.

> La colonne **`conso/1000`** du Sheet est **ignorée volontairement** : elle
> vaut la base divisée par deux et fausserait le calcul du minimum. Le script
> le signale si elle est présente dans votre fichier.

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

## 12. État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 0 | Fondations : schéma, RLS, tests de sécurité, seed, authentification | ✅ |
| 1 | Back-office : produits, calculateur, simulateur, CA, imports CSV | ✅ |
| 2 | Parcours employé : comptage aux steppers, rapport de relance | ✅ |
| 3 | Historique, exports, consommation réelle, détection d'anomalies | ✅ |
| 4 | PWA : installation iOS, mode hors ligne, rappels, impression | ✅ |

**Hors périmètre de la version 1 :** la gestion des DLC, la production en
avance pour le lendemain, les formats GN détaillés (l'unité se dit simplement
« gastro » ou « pièce ») et le temps de préparation. Les colonnes `DLC` et
`temps de prépa` sont **stockées en base** mais n'entrent dans aucun calcul.

---

## 13. Données encore à fournir

Le référentiel des **39 produits** et leurs valeurs « VENTE POUR » sont chargés.
Il reste :

1. l'**historique du chiffre d'affaires** de l'an dernier, jour par jour — en
   attendant, la prévision de chaque journée se saisit à la main dans
   *Chiffre d'affaires → Calendrier*, ce qui suffit pour tester ;
2. les **priorités réelles** de chaque produit — tous sont à 3 pour l'instant,
   et se règlent en un clic dans le tableau des produits ;
3. les **planchers et plafonds** par produit, laissés vides.
