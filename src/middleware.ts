import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     *   • les fichiers statiques, images et ressources PWA ;
     *   • `/api/*`, dont les appelants (tâches planifiées) n'ont pas de cookie
     *     de session. Ces routes portent leur propre authentification — la
     *     redirection du middleware les rendrait tout bonnement inatteignables.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|splash/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
