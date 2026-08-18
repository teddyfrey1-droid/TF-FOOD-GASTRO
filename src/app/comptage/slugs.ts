import type { SessionKind } from '@/lib/supabase/database.types';

/** Les URL sont en français ; la base parle `morning` / `afternoon`. */
export const SESSION_SLUGS = {
  matin: { kind: 'morning' as SessionKind, title: 'Comptage du matin' },
  'apres-midi': { kind: 'afternoon' as SessionKind, title: "Comptage de l'après-midi" },
} as const;

export type SessionSlug = keyof typeof SESSION_SLUGS;

export function slugForKind(kind: SessionKind): SessionSlug {
  return kind === 'morning' ? 'matin' : 'apres-midi';
}
