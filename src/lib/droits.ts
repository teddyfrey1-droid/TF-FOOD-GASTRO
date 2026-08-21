import {
  Euro,
  History,
  Salad,
  SlidersHorizontal,
  Snowflake,
  TriangleAlert,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/lib/supabase/database.types';

/**
 * Le catalogue des droits réglables, tel qu'il s'affiche.
 *
 * Les libellés vivent ici plutôt qu'en base : ce sont des phrases
 * destinées à être lues, qu'on retouche sans migration. La liste des
 * paires autorisées, elle, est gravée dans une contrainte SQL — une
 * combinaison hors catalogue ne peut pas entrer en base, même par une
 * écriture directe.
 */
export interface DroitReglable {
  cle: string;
  /**
   * Une icône de trait, pas un emoji.
   *
   * Six emojis de couleurs différentes sur une même colonne se lisent
   * comme un décor : l'œil s'arrête sur la couleur au lieu du texte. Le
   * trait gris laisse le libellé porter le sens, comme partout ailleurs
   * dans Gestion.
   */
  icone: LucideIcon;
  titre: string;
  /** Ce que la personne pourra faire, en une phrase concrète. */
  description: string;
  /** Statuts pour lesquels l'interrupteur existe. */
  reglablePour: UserRole[];
}

export const DROITS: DroitReglable[] = [
  {
    cle: 'historique',
    icone: History,
    titre: 'Historique des comptages',
    description: 'Relire les journées passées : qui a compté, quand, et ce qui restait à faire.',
    reglablePour: ['assistant_manager', 'employee'],
  },
  {
    cle: 'stocks_passes',
    icone: Snowflake,
    titre: 'Stocks des jours passés',
    description: 'Remonter aux quantités relevées les jours précédents, pas seulement aujourd’hui.',
    reglablePour: ['assistant_manager', 'employee'],
  },
  {
    cle: 'annuler_autrui',
    icone: Undo2,
    titre: 'Annuler le comptage d’un collègue',
    description: 'Débloquer une journée quand quelqu’un a commencé sans pouvoir finir.',
    reglablePour: ['assistant_manager', 'employee'],
  },
  {
    cle: 'ruptures',
    icone: TriangleAlert,
    titre: 'Analyse des ruptures',
    description: 'Voir ce qui manque trop souvent, et sur quels produits la base est trop basse.',
    reglablePour: ['assistant_manager', 'employee'],
  },
  {
    cle: 'carte',
    icone: Salad,
    titre: 'Modifier la carte',
    description: 'Ajouter ou renommer des produits, changer les photos et les catégories.',
    reglablePour: ['assistant_manager'],
  },
  {
    cle: 'simulateur',
    icone: SlidersHorizontal,
    titre: 'Simulateur de production',
    description: 'Essayer un chiffre d’affaires et voir les cibles. Affiche les objectifs.',
    reglablePour: ['assistant_manager'],
  },
];

/**
 * Ce qui ne se règle pas, et pourquoi.
 *
 * Affiché à côté des interrupteurs, verrouillé. Le directeur voit ainsi
 * la règle plutôt que de la chercher — et comprend que son absence
 * d'interrupteur est un choix, pas un oubli.
 */
export const DROITS_VERROUILLES: {
  icone: LucideIcon;
  titre: string;
  description: string;
}[] = [
  {
    icone: Euro,
    titre: 'Chiffre d’affaires et cibles',
    description:
      'Réservé au directeur et au propriétaire. C’est la règle fondatrice de l’application : personne d’autre ne voit le CA ni les objectifs de production.',
  },
  {
    icone: Users,
    titre: 'Gestion des comptes',
    description:
      'Créer, supprimer ou changer le statut de quelqu’un reste au directeur. Un droit qui se donne à soi-même n’est plus un droit.',
  },
];

/** Les statuts qui portent des interrupteurs, dans l'ordre d'affichage. */
export const STATUTS_REGLABLES: UserRole[] = ['assistant_manager', 'employee'];
