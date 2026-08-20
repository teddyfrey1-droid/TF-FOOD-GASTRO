import type { UserRole } from '@/lib/supabase/database.types';

/**
 * Les quatre statuts, du plus large au plus restreint.
 *
 * Ce fichier est volontairement SANS dépendance serveur : il est importé par
 * des composants client (l'écran des comptes), et `@/lib/auth` tire
 * `next/headers`, qui ne peut pas franchir cette frontière.
 *
 * ⚠️ `isManagerRole` est la barrière du CHIFFRE D'AFFAIRES : elle ne s'ouvre
 * pas à l'assistant manager, qui pilote un service sans avoir à connaître le
 * chiffre d'affaires du restaurant.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Propriétaire',
  manager: 'Directeur',
  assistant_manager: 'Assistant manager',
  employee: 'Salarié',
};

/** Ce que chaque statut peut faire, en une phrase, pour l'écran des comptes. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Tout, y compris le chiffre d’affaires et les comptes',
  manager: 'Tout, y compris le chiffre d’affaires et les comptes',
  assistant_manager: 'Comptages, historique et produits — jamais le chiffre d’affaires',
  employee: 'Les comptages du jour, rien d’autre',
};

/** Accès au chiffre d'affaires, aux cibles et aux réglages. */
export function isManagerRole(role: UserRole): boolean {
  return role === 'manager' || role === 'owner';
}

/** Accès au pilotage de service : historique et fiche produits. */
export function isStaffLeadRole(role: UserRole): boolean {
  return role === 'assistant_manager' || isManagerRole(role);
}
