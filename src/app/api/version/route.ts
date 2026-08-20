import { NextResponse } from 'next/server';

/**
 * La version actuellement publiée.
 *
 * Volontairement hors du middleware (`/api/*` en est exclu) et jamais mise
 * en cache : c'est le point de comparaison des applications installées, il
 * doit dire la vérité à la seconde près. Il ne renvoie aucune donnée du
 * restaurant, donc aucune authentification n'est nécessaire.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'inconnu' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
