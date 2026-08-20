import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

/**
 * Client Supabase pour composants serveur et Server Actions.
 * Il porte le JWT de l'utilisateur : la RLS s'applique donc pleinement.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit
            // déjà la session, on peut ignorer.
          }
        },
      },
    },
  );
}

/**
 * Client à privilèges administrateur (clé de service).
 *
 * ⚠️ Il CONTOURNE la RLS. Réservé à la création de comptes et aux imports
 * de données depuis le back-office. Ne jamais l'utiliser pour servir une
 * requête venant du téléphone d'un employé.
 */
/**
 * Client anonyme SANS session, pour inscrire quelqu'un d'autre.
 *
 * `signUp` ouvre une session au nom du compte créé. Si ce client écrivait
 * les cookies, le directeur se retrouverait connecté à la place de sa
 * nouvelle recrue au milieu de sa propre page. Les cookies sont donc
 * neutralisés : la session créée est simplement jetée.
 */
export function createSignUpClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY est absente : les opérations d’administration sont indisponibles.',
    );
  }

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
