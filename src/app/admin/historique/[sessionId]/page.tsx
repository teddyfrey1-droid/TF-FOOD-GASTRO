import { requireStaffLead } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionDetail } from '@/lib/admin/history';
import { formatDateLong, formatEuro, formatQty } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { toNullableNumber } from '@/lib/admin/mappers';

export const dynamic = 'force-dynamic';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireStaffLead();
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('count_sessions')
    .select('id, date, session, status, started_at, submitted_at, user_id, forecast_revenue_snapshot')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) notFound();

  const [lines, { data: author }] = await Promise.all([
    getSessionDetail(sessionId),
    supabase.from('team_members').select('full_name').eq('id', session.user_id).maybeSingle(),
  ]);

  const reordered = lines.filter((line) => (line.productionNeeded ?? 0) > 0);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/historique" className="text-muted-foreground text-sm hover:underline">
          ← Historique
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight capitalize">
          {formatDateLong(session.date)} — {session.session === 'morning' ? 'matin' : 'après-midi'}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {author?.full_name ?? '—'}
          {session.submitted_at
            ? ` · validé à ${TIME.format(new Date(session.submitted_at))}`
            : ' · comptage en cours'}
          {' · CA prévu au moment du comptage : '}
          {formatEuro(toNullableNumber(session.forecast_revenue_snapshot))}
        </p>
      </header>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <caption className="text-muted-foreground px-4 py-3 text-left text-xs">
            Les cibles et seuils affichés sont ceux <strong>figés au moment du comptage</strong>.
            Modifier le calculateur aujourd&apos;hui ne change pas cette page.
          </caption>
          <thead>
            <tr className="bg-muted/50 border-y">
              <th scope="col" className="px-4 py-3 text-left font-semibold">Produit</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Saladbar</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Frigo</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Total</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Cible</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Seuil</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Relance</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Faite</th>
            </tr>
          </thead>

          <tbody>
            {lines.map((line) => (
              <tr key={line.productId} className="hover:bg-muted/30 border-b last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {line.productName}
                  {line.isNotApplicable ? (
                    <span className="text-muted-foreground block text-xs font-normal">
                      absent — {line.notApplicableReason}
                    </span>
                  ) : (
                    <span className="text-muted-foreground block text-xs font-normal">
                      {line.categoryName}
                    </span>
                  )}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{formatQty(line.qtySaladbar)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatQty(line.qtyFridge)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatQty(line.qtyTotal)}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {formatQty(line.targetSnapshot)}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {formatQty(line.thresholdSnapshot)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(line.productionNeeded ?? 0) > 0 ? formatQty(line.productionNeeded) : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  {line.taskDone === null ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : line.taskDone ? (
                    <Badge variant="secondary">faite</Badge>
                  ) : (
                    <Badge variant="outline">non faite</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          {reordered.length} produit{reordered.length > 1 ? 's' : ''} à relancer sur {lines.length}.
        </p>
        <Link
          href={`/admin/historique/export?comptage=${sessionId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Exporter cette session
        </Link>
      </div>
    </div>
  );
}
