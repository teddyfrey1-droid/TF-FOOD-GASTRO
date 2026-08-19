# Les rappels de comptage

> « Il est 15 h, le comptage de l'après-midi n'est pas fait. »

Une notification part sur les téléphones de l'équipe si le comptage n'a pas
encore été validé. Elle ne part **qu'une fois par jour et par session**, même si
la tâche s'exécute plusieurs fois : c'est la table `reminder_sends` qui fait
verrou.

## Pourquoi l'heure peut glisser d'une heure en été

Les tâches planifiées de Vercel raisonnent en **UTC**, alors que le restaurant
vit à l'heure de Paris — qui change deux fois par an.

L'implémentation d'origine contournait le problème en s'exécutant toutes les
demi-heures dans une fenêtre large, la fonction `mep_claim_reminder` ne
laissant passer que le premier passage après l'heure prévue à Paris. C'est la
solution exacte, mais **le plan Hobby de Vercel n'autorise qu'un déclenchement
par jour et par tâche**.

Les horaires sont donc calés sur l'**heure d'hiver** :

| Rappel | Cron (UTC) | Hiver (CET) | Été (CEST) |
|---|---|---|---|
| Matin | `30 6 * * *` | 07 h 30 ✅ | 08 h 30 |
| Après-midi | `0 14 * * *` | 15 h 00 ✅ | 16 h 00 |

Ce choix est délibéré : caler sur l'heure d'été ferait passer la tâche **avant**
l'heure prévue en hiver, et `mep_claim_reminder` refuserait alors l'envoi — le
rappel ne partirait pas du tout. Mieux vaut une heure de retard qu'un rappel
manquant.

## Revenir à l'heure juste

Deux façons, au choix :

1. **Passer Vercel en plan Pro** et restaurer la fenêtre d'origine :
   `0,30 4-9 * * *` le matin, `0,30 11-16 * * *` l'après-midi. Le rappel tombe
   alors à la minute près toute l'année, sans rien changer au code.
2. **Ajuster les deux crons** dans `vercel.json` au passage à l'heure d'été,
   puis à l'heure d'hiver. Deux minutes, deux fois par an.

## Ce qu'il faut pour que ça marche

- La variable `SUPABASE_SERVICE_ROLE_KEY` dans Vercel : la tâche lit les
  abonnements pour le compte de tout le monde, ce qu'aucun rôle applicatif ne
  peut faire.
- Les employés doivent avoir **ajouté l'app à leur écran d'accueil** : sur
  iPhone, les notifications web ne fonctionnent pas depuis Safari.

Sans la clé de service, tout le reste de l'application fonctionne — seuls les
rappels sont muets.
