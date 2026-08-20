# Où tourne l'application

## Les fonctions doivent tourner à Paris

La base Supabase est en **eu-west-3 (Paris)**. Par défaut, Vercel exécute
les fonctions en **iad1 (Washington)** : chaque requête traversait alors
l'Atlantique deux fois, soit environ **90 ms perdues par requête**. Une page
en fait cinq à dix — l'écran de gestion approchait la seconde de pure
latence réseau, sans qu'aucun calcul soit en cause.

`vercel.json` fixe donc `"regions": ["cdg1"]` (Paris), la même ville que la
base.

> `vercel.json` n'accepte **aucune clé supplémentaire**, pas même une clé
> `"//"` en guise de commentaire : le déploiement échoue à la validation du
> schéma, avant même de compiler. D'où ce fichier.

## Plus rien à régler à la main

Il n'y a **aucune variable d'environnement à poser** pour que l'application
fonctionne. Ce qui l'exigeait autrefois a été déplacé :

| Ce qu'il fallait poser | Où c'est passé |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Plus nécessaire. La création de comptes passe par l'inscription ordinaire ; les rappels tournent dans une fonction Edge, où la clé est injectée d'office. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Écrite en clair dans `src/lib/pwa/push.ts` — elle est publique par construction. |
| `VAPID_PRIVATE_KEY`, `CRON_SECRET` | Au coffre-fort de la base (`vault`), hors du dépôt qui est public. |

### La seule exception

Réinitialiser le mot de passe **de quelqu'un d'autre** depuis l'écran Équipe
demande encore `SUPABASE_SERVICE_ROLE_KEY` sur l'hébergeur : changer le mot
de passe d'un tiers se fait dans le service d'authentification, hors de
portée d'une clé publique.

Sans elle, l'écran le dit et propose le contournement : l'employé change son
mot de passe lui-même depuis « Mon compte ».

## Les rappels tournent sur Supabase

`pg_cron` réveille la fonction Edge `rappels` toutes les quinze minutes.
C'est la base qui décide si l'heure de Paris est venue — `mep_claim_reminder`
ne dit vrai qu'une fois par jour et par session.

Ce choix vient d'une contrainte : le plan Hobby de Vercel n'autorise qu'un
déclenchement quotidien par tâche, ce qui obligeait à viser une heure fixe en
UTC. Calée sur l'heure d'hiver, elle partait une heure trop tard tout l'été ;
calée sur l'été, elle serait partie trop tôt en hiver et `mep_claim_reminder`
aurait refusé l'envoi. Un réveil au quart d'heure supprime le compromis.

La fonction n'a pas de vérification de JWT — `pg_cron` n'a aucun jeton
d'utilisateur — mais exige un secret partagé en en-tête, relu au coffre-fort
à chaque exécution. Un appel sans ce secret reçoit un 401.
