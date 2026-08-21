/**
 * La version de l'application, telle qu'elle s'affiche dans « Mon compte ».
 *
 * Trois nombres, et une règle simple :
 *
 *   1.0.0 → le premier chiffre change quand l'application change de nature
 *           (un nouvel écran majeur, une nouvelle façon de travailler).
 *   1.1.0 → le deuxième, pour une amélioration : quelque chose de nouveau
 *           ou de nettement plus agréable, sans rien casser.
 *   1.1.1 → le troisième, pour une correction de bogue uniquement.
 *
 * Le numéro sert à répondre à une seule question, posée depuis un
 * téléphone : « est-ce que ma demande est bien passée ? ». Il faut donc le
 * changer À CHAQUE publication, et écrire la ligne du journal au passage —
 * un numéro qui n'avance pas ne dit plus rien.
 */
export const VERSION = '3.2.2';

export interface EntreeJournal {
  version: string;
  /** Date de publication, au format ISO (AAAA-MM-JJ). */
  date: string;
  /** Ce que la version change, en une phrase par point. */
  points: string[];
}

/**
 * Le journal des versions, de la plus récente à la plus ancienne.
 *
 * Écrit pour être lu par l'équipe, pas par un développeur : on y parle de
 * ce qui change à l'écran, jamais de code.
 */
export const JOURNAL: EntreeJournal[] = [
  {
    version: '3.2.2',
    date: '2026-08-25',
    points: [
      'La carte du chiffre d’affaires est resserrée : un seul filet, tout sur trois lignes.',
    ],
  },
  {
    version: '3.2.1',
    date: '2026-08-25',
    points: [
      'Les deux compteurs de l’onglet Stocks sont centrés et nettement plus gros.',
      'Le CA prévisionnel respire lentement pour attirer l’œil, sans que la carte grandisse.',
      'Vignettes du comptage réduites d’un cran : plus de produits par écran.',
    ],
  },
  {
    version: '3.2.0',
    date: '2026-08-25',
    points: [
      'Nouvel espace « Suivi de connexion » dans Gestion, réservé au propriétaire.',
      'Chaque personne se déplie sur ses trente derniers jours : connexions, écrans, comptages, réglages.',
      'Les traces s’effacent d’elles-mêmes au bout de 90 jours.',
    ],
  },
  {
    version: '3.1.0',
    date: '2026-08-24',
    points: [
      'L’onglet Stocks se range par urgence : en rupture, juste, en trop, puis le reste.',
      'Les groupes urgents s’ouvrent seuls ; « Ce qui va bien » reste replié.',
      'Deux nombres en tête répondent d’un coup d’œil : combien manquent, combien sont en trop.',
    ],
  },
  {
    version: '3.0.0',
    date: '2026-08-24',
    points: [
      'Un troisième meuble : le frigo desserts. Les 9 desserts y ont été déplacés.',
      'Le comptage se fait en trois passes, avec un onglet par meuble.',
      'Stocks, historique, produits et catégories affichent la troisième colonne.',
    ],
  },
  {
    version: '2.4.1',
    date: '2026-08-24',
    points: [
      'Les tuiles de zone de la page Produits passent en icônes grises, sans emojis colorés.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-08-24',
    points: [
      'Fiche produit repensée : où il est rangé, à partir de quand en refaire, et s’il est compté.',
      'Saladbar et Frigo du bas deviennent deux vrais boutons, nommés en entier.',
      'Les seuils annoncent leur règle au lieu de « Min auto » / « Min fixe ».',
      'Un produit rangé nulle part est signalé : il n’entrait dans aucun comptage sans qu’on le voie.',
    ],
  },
  {
    version: '2.3.1',
    date: '2026-08-24',
    points: [
      'Le contrôle d’accès se replie et descend sous « L’équipe ».',
      'Ses emojis colorés deviennent des icônes grises, comme le reste de Gestion.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-08-24',
    points: [
      '« Stock suffisant » montre enfin les produits, avec photo et quantité relevée.',
      'Une note peut être laissée sur le comptage, et un comptage validé se rouvre d’un appui.',
      'Page Produits : trois tuiles disent combien de produits sont comptés en haut, en bas, ou nulle part — et filtrent la liste.',
      'Un produit jamais compté peut être supprimé pour de bon.',
      'Les vignettes du comptage sont plus compactes : plus de produits par écran.',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-08-23',
    points: [
      'Nouvelle section « Contrôle d’accès » dans Gestion : un interrupteur par accès et par statut.',
      'Le chiffre d’affaires, les cibles et la gestion des comptes restent verrouillés — et l’écran dit pourquoi.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-08-23',
    points: [
      'Avant son heure, la carte du comptage devient entièrement grise et ne s’ouvre pour personne.',
      'Un comptage commencé puis abandonné s’annule d’un appui, et repart à « À faire ».',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-08-23',
    points: [
      'Fini les liens par e-mail « expirés » : l’accès se donne avec un code de 8 caractères, valable 24 h.',
      'Première connexion et mot de passe oublié passent par le même écran, sans aucun e-mail.',
      'Un compte peut être supprimé définitivement depuis Équipe.',
      'Déconnexion en bas de Gestion.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-08-22',
    points: [
      'Un produit très au-dessus de sa cible passe en rouge : « trop » et « beaucoup trop » ne se valent pas.',
      'Chaque comptage a son heure d’ouverture, réglable dans Gestion. Avant l’heure, la carte est grisée.',
      'Dans les jours passés, chaque comptage se déplie : ce qu’il y avait à produire, et ce qu’il y avait dans les frigos.',
      'Simulateur : le chiffre d’affaires est centré et les paliers allégés.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-08-22',
    points: [
      'Nouvel onglet « Stocks » : les quantités de chaque produit, avec recherche, pour toute l’équipe.',
      'Un produit en trop grande quantité est signalé, avec l’excédent — pour garder un œil dessus.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-08-22',
    points: [
      'Le simulateur tient en une liste dense : toute la carte se lit sans dérouler.',
      'La recherche du comptage trouve aussi les produits de l’autre zone, et propose d’y aller.',
      'Les jours passés se replient : une ligne par journée, on ouvre celle qu’on cherche.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-08-22',
    points: [
      'Correction : le montant annoncé « l’an dernier » était en fait la cible du jour. C’est désormais le CA réellement encaissé.',
      'Les cartes de comptage ressortent, avec le nom de qui s’en occupe — ambre si personne.',
      'Le taux de croissance et les tendances constatées sont séparés : la pastille en haut, le réglage en bas.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-22',
    points: [
      'Le chiffre d’affaires du jour s’affiche dès l’accueil, pour le directeur et le propriétaire.',
      'Le CA de l’an dernier est donné nu, avant majoration, pour juger la prévision d’un coup d’œil.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-22',
    points: [
      'Le simulateur a son onglet en bas, pour le directeur et le propriétaire.',
      'La barre d’onglets reste visible dans Gestion : on n’y entre plus sans pouvoir en sortir.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-22',
    points: [
      'L’application s’installe seule dès qu’une version est publiée, sans fermer ni se déconnecter.',
      'Les saisies en attente s’affichent, se renvoient toutes seules, et un bouton permet de réessayer.',
      'Un comptage ne peut plus être validé tant qu’une saisie n’est pas arrivée au serveur.',
      'L’historique ouvre sur une synthèse : assiduité, relances produites, durée moyenne, qui a compté.',
      'Couleurs d’alerte adoucies, état des comptages plus lisible, accueil allégé.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-21',
    points: [
      'Un lien d’activation à copier, sans e-mail ni limite, pour donner son accès à quelqu’un.',
      'L’écran Équipe affiche les adresses et repère les comptes jamais utilisés.',
      'Le comptage garde son historique : les journées passées se relisent d’un coup d’œil.',
      'L’application s’appelle Lafayette partout.',
      'Numéro de version affiché ici même, pour suivre les mises à jour.',
      'Correction : la base et l’application parlent enfin du même jour, passé minuit.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-20',
    points: [
      'Comptage du matin et de l’après-midi, zone par zone.',
      'Rapport de production trié par urgence, seuil critique en tête.',
      'Chiffre d’affaires prévisionnel et taux de croissance réglable.',
      'Rappels sur le téléphone à l’heure des comptages.',
    ],
  },
];
