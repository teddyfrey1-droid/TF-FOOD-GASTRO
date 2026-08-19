# Mettre l'application en ligne

La base de données est **déjà en place**. Il reste environ **20 minutes** :
brancher Vercel, puis créer les comptes.

---

## 1. La base de données — ✅ faite

Projet Supabase **`mep-heiko`**, région Paris.

| | |
|---|---|
| Schéma | appliqué, sécurités comprises |
| Produits | 39, avec leurs valeurs « VENTE POUR » |
| Historique de CA | 691 journées, du 9 sept. 2024 au 31 juil. 2026, en **HT** |
| Réalisé | les 365 derniers jours, pour le calibrage de croissance |
| Taux de croissance | réglé à **+28 %** (voir §4) |
| Sécurité | vérifiée : un employé ne lit aucune ligne de CA |

Contrôles du cahier des charges rejoués sur cette base :

| Produit | CA de référence | Cible | Minimum |
|---|---|---|---|
| Saumon | 4 000 € | 10 | 5 |
| Saumon | 5 000 € | 12 | 6 |
| Gyoza Poulet | 5 000 € | 24 | 12 |
| Thon | 4 000 € | 1 | 0,5 |

Rien à faire de ce côté.

---

## 2. Mettre le site en ligne (10 min)

1. Aller sur [vercel.com](https://vercel.com) → **Add New → Project**.
2. Importer le dépôt `TF-FOOD-GASTRO`, sur la branche
   `claude/mep-stock-management-app-hz12fj`.
3. Dans **Environment Variables**, coller :

```
NEXT_PUBLIC_SUPABASE_URL       https://juvtrzlrqhwexddxieak.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  Supabase → Project Settings → API Keys → anon
SUPABASE_SERVICE_ROLE_KEY      même écran, clé « service_role »
```

4. **Deploy**. Deux minutes plus tard, l'adresse `…vercel.app` est active.

> La clé `service_role` **contourne toutes les sécurités**. Elle ne doit jamais
> sortir des variables d'environnement de Vercel — ni être préfixée
> `NEXT_PUBLIC_`, ce qui l'exposerait dans le navigateur.

---

## 3. Créer les comptes (10 min)

### Votre compte propriétaire

1. Dans Supabase : **Authentication → Users → Add user**. Renseigner e-mail et
   mot de passe, cocher *Auto Confirm User*.
2. Puis, dans **SQL Editor** :

```sql
update public.profiles set role = 'owner'
where id = (select id from auth.users where email = 'votre@email.fr');
```

> Tout compte créé naît **employé**. C'est volontaire : sans cela, n'importe
> qui pourrait s'inscrire et lire votre chiffre d'affaires.

### Les comptes de l'équipe

Une fois connecté en propriétaire, tout se fait depuis **Gestion →
Utilisateurs** : création, mot de passe initial, désactivation.

---

## 4. Les cinq minutes de réglage

Dans **Gestion → Chiffre d'affaires** :

1. **Taux de croissance.** Réglé à **+28 %**, mesuré sur vos 90 derniers jours.
   L'écran affiche aussi le taux sur 12 mois (+41,8 %) : votre croissance
   ralentit d'un trimestre à l'autre, c'est donc la tendance récente qui
   prédit le mieux les semaines à venir. Ajustable en un clic.
2. **Jours de fermeture.** Les cocher dans le calendrier du mois.

Dans **Gestion → Produits** :

3. **Les priorités.** Tous les produits sont à 3. Passez à **1** ce qui ne doit
   jamais manquer, à **5** ce qui peut attendre. Un clic par produit, depuis le
   tableau.
4. **Les minimums fixes**, si vous en voulez sur certains produits — le bouton
   « Min auto / Min fixe » est dans le tableau lui aussi.

Dans **Gestion → Simulateur** : saisir un chiffre d'affaires typique et vérifier
que les cibles correspondent à ce que vous produisez réellement. C'est le moment
de rattraper une valeur « VENTE POUR » qui ne colle pas.

---

## 5. Installer l'app sur les téléphones

Sur l'iPhone de chaque employé :

1. Ouvrir l'adresse Vercel dans **Safari** (pas Chrome).
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. L'icône MEP apparaît comme une vraie application.

Installée ainsi, elle fonctionne **en mode avion** : les saisies restent sur le
téléphone et remontent seules au retour du réseau. C'est aussi la seule façon
d'avoir les notifications de rappel sur iPhone.

---

## Et ensuite

Chaque `git push` sur la branche redéploie le site automatiquement.

Les migrations, elles, ne s'appliquent pas toutes seules : une nouvelle
migration se joue dans le **SQL Editor** de Supabase, ou avec
`supabase db push` si vous installez la CLI.
