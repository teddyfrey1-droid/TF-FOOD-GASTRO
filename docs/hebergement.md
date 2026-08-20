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

## Ce qui reste à régler à la main

`SUPABASE_SERVICE_ROLE_KEY` doit être ajoutée dans Vercel
(Settings → Environment Variables). Elle sert à deux choses, et deux
seulement :

- créer un compte pour quelqu'un d'autre depuis l'écran **Équipe** ;
- réinitialiser le mot de passe d'un membre.

Tout le reste de l'application fonctionne sans elle. Sa valeur se trouve
dans Supabase → Project Settings → API keys → `service_role`.

Cette clé contourne toutes les règles de sécurité de la base : elle ne doit
jamais être exposée côté navigateur, donc jamais préfixée `NEXT_PUBLIC_`.
