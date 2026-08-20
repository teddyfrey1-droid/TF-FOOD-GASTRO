import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buttonVariants } from '@/components/ui/button';
import { todayInParis } from '@/lib/format';
import { LienRetour } from '@/components/lien-retour';
import { ReorderReport, type ReportTask } from '@/components/comptage/reorder-report';
import { SESSION_SLUGS, type SessionSlug } from '../../slugs';
import { toNumber } from '@/lib/admin/mappers';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ session: string }> }) {
  await requireUser();

  const { session } = await params;
  const config = SESSION_SLUGS[session as SessionSlug];
  if (!config) notFound();

  const supabase = await createClient();
  // Date de PARIS : en UTC, entre minuit et 2 h, on chercherait le
  // rapport de la veille.
  const today = todayInParis();

  const { data: countSession } = await supabase
    .from('count_sessions')
    .select('id, status, submitted_at')
    .eq('date', today)
    .eq('session', config.kind)
    .maybeSingle();

  // Pas encore validé : il n'y a rien à relancer, on renvoie au comptage.
  if (!countSession || countSession.status !== 'submitted') {
    redirect(`/comptage/${session}`);
  }

  const [{ data: tasks }, { data: lines }] = await Promise.all([
    supabase.rpc('mep_reorder_report', { p_session_id: countSession.id }),
    supabase
      .from('count_lines')
      .select('product_id, qty_total, is_not_applicable')
      .eq('session_id', countSession.id),
  ]);

  // Les identifiants de tâche ne sortent pas de la fonction : on les relit ici
  // pour pouvoir cocher.
  const { data: taskRows } = await supabase
    .from('production_tasks')
    .select('id, product_id')
    .eq('session_id', countSession.id);

  const taskIdByProduct = new Map((taskRows ?? []).map((row) => [row.product_id, row.id]));

  const reorderTasks: ReportTask[] = (tasks ?? []).map((row) => ({
    taskId: taskIdByProduct.get(row.product_id) ?? row.product_id,
    productName: row.product_name,
    notes: row.notes,
    qtyToProduce: toNumber(row.qty_to_produce, 0),
    unit: row.unit,
    priority: Number(row.priority),
    isDone: row.is_done,
    imageUrl: row.image_url,
    categoryName: row.category_name,
  }));

  const reorderedIds = new Set((tasks ?? []).map((row) => row.product_id));
  const sufficientCount = (lines ?? []).filter(
    (line) => !reorderedIds.has(line.product_id) && !line.is_not_applicable,
  ).length;

  return (
    <main className="mx-auto w-full max-w-md px-5 pt-4 pb-6">
      <LienRetour className="mb-3" />

      <ReorderReport
        title={config.title}
        tasks={reorderTasks}
        sufficientCount={sufficientCount}
      />

      <Link href="/" className={buttonVariants({ variant: 'ghost', className: 'mt-8 h-11 w-full' })}>
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
