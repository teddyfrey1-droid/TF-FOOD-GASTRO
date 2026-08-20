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
export const VERSION = '1.1.0';

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
