import { NextRequest } from 'next/server';
import { getCurrentUser, isManagerRole } from '@/lib/auth';
import { getSessionDetail, getSessions } from '@/lib/admin/history';
import { toCsv, csvResponse } from '@/lib/csv-export';
import { todayInParis } from '@/lib/format';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

/**
 * Export CSV de l'historique.
 *
 * La RLS protégerait déjà les données, mais on refuse explicitement l'accès
 * ici : une route de téléchargement ne doit pas répondre « 200 avec un fichier
 * vide » à quelqu'un qui n'a rien à y faire.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive || !isManagerRole(user.role)) {
    return new Response('Accès refusé.', { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  // `comptage` désigne UNE session par son identifiant ; `session` filtre par
  // moment de la journée. Deux paramètres distincts, deux sens distincts.
  const sessionId = params.get('comptage');

  // Export d'une session précise : le détail ligne à ligne.
  if (sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)) {
    const lines = await getSessionDetail(sessionId);

    return csvResponse(
      `mep-comptage-${sessionId.slice(0, 8)}.csv`,
      toCsv(
        [
          'Produit',
          'Catégorie',
          'Format GN',
          'Saladbar',
          'Frigo',
          'Total',
          'Cible',
          'Seuil',
          'À relancer',
          'Relance faite',
          'Absent',
          'Motif',
        ],
        lines.map((line) => [
          line.productName,
          line.categoryName,
          line.gnFormat,
          line.qtySaladbar,
          line.qtyFridge,
          line.qtyTotal,
          line.targetSnapshot,
          line.thresholdSnapshot,
          line.productionNeeded,
          line.taskDone === null ? '' : line.taskDone ? 'oui' : 'non',
          line.isNotApplicable ? 'oui' : 'non',
          line.notApplicableReason,
        ]),
      ),
    );
  }

  // Export d'une période : une ligne par comptage.
  const today = todayInParis();
  const to = params.get('au') ?? today;
  const from = params.get('du') ?? today;
  const sessionFilter = params.get('session');

  const sessions = await getSessions({
    from,
    to,
    session:
      sessionFilter === 'morning' || sessionFilter === 'afternoon'
        ? (sessionFilter as SessionKind)
        : undefined,
  });

  return csvResponse(
    `mep-historique-${from}_${to}.csv`,
    toCsv(
      [
        'Date',
        'Session',
        'Employé',
        'État',
        'Validé à',
        'Produits comptés',
        'Produits total',
        'Relances demandées',
        'Relances faites',
        'CA prévu (figé)',
        'Durée (min)',
      ],
      sessions.map((session) => [
        session.date,
        session.session === 'morning' ? 'Matin' : 'Après-midi',
        session.authorName,
        session.status === 'submitted' ? 'validé' : 'en cours',
        session.submittedAt,
        session.productsCounted,
        session.productsTotal,
        session.tasksTotal,
        session.tasksDone,
        session.forecastSnapshot,
        session.durationMinutes,
      ]),
    ),
  );
}
