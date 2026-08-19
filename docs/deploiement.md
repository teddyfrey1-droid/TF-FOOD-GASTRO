# Mettre l'application en ligne

Compter environ **45 minutes**, sans compétence technique particulière. Tout se
fait dans un navigateur, sauf une commande à copier-coller.

---

## 1. Créer la base de données (10 min)

1. Aller sur [supabase.com](https://supabase.com) → **Start your project**, se
   connecter avec GitHub.
2. **New project** :
   - Nom : `mep-heiko`
   - Mot de passe : en générer un et **le conserver**, il sert à l'étape 2
   - Région : **Europe (Paris)** ou **Frankfurt**
3. Attendre 2 minutes que le projet démarre.

Puis récupérer trois valeurs dans **Project Settings** :

| Où | Quoi | Pour plus tard |
|---|---|---|
| Data API → Project URL | `https://xxxx.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| Data API → anon public | une longue clé `eyJ…` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Data API → service_role | une autre longue clé `eyJ…` | `SUPABASE_SERVICE_ROLE_KEY` |
| Database → Connection string → URI | `postgresql://…` | `SUPABASE_DB_URL` |

> La clé `service_role` **contourne toutes les sécurités**. Elle ne doit jamais
> être collée ailleurs que dans les variables d'environnement de Vercel.

---

## 2. Charger le schéma et les données (10 min)

Dans Supabase, ouvrir **SQL Editor**, puis exécuter dans cet ordre, en copiant
le contenu de chaque fichier du dépôt :

| Ordre | Fichier | Ce que ça fait |
|---|---|---|
| 1 | `supabase/migrations/*.sql` — **dans l'ordre des noms** | crée les tables, les sécurités et le moteur de calcul |
| 2 | `supabase/seed.sql` | charge les 39 produits et leurs valeurs « VENTE POUR » |
| 3 | `supabase/seed_revenue.sql` | charge les 660 journées de chiffre d'affaires |

En ligne de commande, c'est plus rapide :

```bash
supabase link --project-ref <ref-du-projet>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
psql "$SUPABASE_DB_URL" -f supabase/seed_revenue.sql
```

---

## 3. Mettre le site en ligne (10 min)

1. Aller sur [vercel.com](https://vercel.com) → **Add New → Project**.
2. Importer le dépôt `TF-FOOD-GASTRO`, brancher la branche
   `claude/mep-stock-management-app-hz12fj`.
3. Dans **Environment Variables**, coller les trois valeurs de l'étape 1 :

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

4. **Deploy**. Au bout de deux minutes, l'adresse `…vercel.app` est active.

---

## 4. Créer les comptes (10 min)

### Votre compte propriétaire

1. Ouvrir l'adresse Vercel, cliquer **Se connecter**.
2. Comme aucun compte n'existe encore, le créer dans Supabase :
   **Authentication → Users → Add user**, avec e-mail et mot de passe, en
   cochant *Auto Confirm User*.
3. Puis, dans **SQL Editor**, se donner les droits :

```sql
update public.profiles set role = 'owner' where id = '<votre-uuid>';
```

L'uuid se lit dans la liste des utilisateurs.

> Tout compte créé naît **employé**. C'est volontaire : sans cela, n'importe
> qui pourrait s'inscrire et lire votre chiffre d'affaires.

### Les comptes de l'équipe

Une fois connecté en propriétaire, tout se fait depuis
**Gestion → Utilisateurs** : création, mot de passe initial, désactivation.

---

## 5. Les cinq minutes de réglage

Dans **Gestion → Chiffre d'affaires** :

1. **Taux de croissance.** L'écran affiche le taux constaté sur vos données —
   autour de **+43 %**. Le bouton l'applique d'un clic.
2. **Vérifier la base des montants.** Votre historique est en **TTC** ; les
   valeurs « VENTE POUR » doivent l'être aussi.
3. **Jours de fermeture.** Les cocher dans le calendrier du mois.

Dans **Gestion → Produits** :

4. **Les priorités.** Tous les produits sont à 3. Passez à 1 ce qui ne doit
   jamais manquer, à 5 ce qui peut attendre. Un clic par produit.
5. **Les minimums fixes**, si vous en voulez sur certains produits.

Dans **Gestion → Simulateur** : saisir un chiffre d'affaires typique et vérifier
que les cibles correspondent à ce que vous produisez réellement. C'est le
moment de rattraper une valeur « VENTE POUR » qui ne colle pas.

---

## 6. Installer l'app sur les téléphones

Sur l'iPhone de chaque employé :

1. Ouvrir l'adresse Vercel dans **Safari** (pas Chrome).
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. L'icône MEP apparaît comme une vraie application.

Installée ainsi, elle fonctionne **en mode avion** : les saisies sont
conservées sur le téléphone et remontent seules au retour du réseau.

---

## Et ensuite

Chaque `git push` sur la branche redéploie le site automatiquement. Les
migrations, elles, ne s'appliquent pas toutes seules : une nouvelle migration
se joue dans le SQL Editor de Supabase.
