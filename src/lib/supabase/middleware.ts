import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Chemins d'authentification : accessibles déconnecté, inutiles une fois connecté. */
const AUTH_PATHS = [
  '/connexion',
  '/mot-de-passe-oublie',
  // Le lien d'activation arrive avec son jeton dans le FRAGMENT de l'URL
  // (`#access_token=…`), que le navigateur n'envoie jamais au serveur. Vu
  // d'ici la personne est donc anonyme : sans cette entrée, elle serait
  // renvoyée à la connexion avant d'avoir pu choisir son mot de passe.
  '/definir-mot-de-passe',
];

/**
 * Chemins toujours accessibles, connecté ou non.
 * La page hors ligne en fait partie : le service worker la sert quand il n'y
 * a plus de réseau, et il n'y a alors aucun moyen de vérifier la session.
 */
const ALWAYS_PUBLIC_PATHS = ['/hors-ligne'];

/**
 * Le back-office s'ouvre à l'ENCADREMENT — assistant manager compris, qui y
 * consulte l'historique des comptages. Chaque page pose ensuite sa propre
 * garde : la barrière du chiffre d'affaires reste `requireManager`, ici et
 * en base.
 */
const STAFF_LEAD_PATHS = ['/admin'];
const STAFF_LEAD_ROLES = ['assistant_manager', 'manager', 'owner'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalide le jeton auprès de Supabase : ne pas le remplacer par
  // getSession(), qui se contente de lire un cookie potentiellement forgé.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (ALWAYS_PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return response;
  }

  const isPublic = AUTH_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.searchParams.set('suite', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Le back-office est rejoué ici pour éviter un aller-retour inutile, mais
  // la vraie protection reste la RLS : même en forçant l'URL, un employé ne
  // récupérerait aucune donnée.
  if (user && STAFF_LEAD_PATHS.some((path) => pathname.startsWith(path))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_active || !STAFF_LEAD_ROLES.includes(profile.role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
