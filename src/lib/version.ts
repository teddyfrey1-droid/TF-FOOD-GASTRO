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
export const VERSION = '1.7.0';

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
