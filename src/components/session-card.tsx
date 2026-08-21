import Link from 'next/link';
import { Check, ChevronRight, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SessionKind, SessionStatus } from '@/lib/supabase/database.types';

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

interface SessionSummary {
  id: string;
  status: SessionStatus;
  submitted_at: string | null;
  authorName: string | null;
  /** Relances encore à produire sur ce comptage. */
  pendingTasks: number;
  doneTasks: number;
}

/**
 * Grosse cible tactile : l'employé lance son comptage d'un pouce, sans viser.
 * Aucune donnée de CA n'apparaît ici — uniquement l'état d'avancement.
 */
export function SessionCard({
  kind,
  title,
  session,
  ouvreA,
  contournable = false,
}: {
  kind: SessionKind;
  title: string;
  session: SessionSummary | null;
  /** Heure d'ouverture « HH:MM », si elle n'est pas encore passée. */
  ouvreA?: string | null;
  /** L'encadrement peut ouvrir avant l'heure : un service peut déborder. */
  contournable?: boolean;
}) {
  // Un comptage lancé trop tôt décrit des frigos qui n'ont pas encore
  // vécu la journée. On grise donc avant l'heure — mais on n'enferme
  // personne : un chef de service passe outre, parce que la réalité du
  // terrain prime sur un réglage.
  const enAttente = Boolean(ouvreA) && session === null;
  const verrouille = enAttente && !contournable;
  const status = session?.status ?? null;

  const label = status === 'submitted' ? 'Fait' : status === 'draft' ? 'En cours' : 'À faire';

  // Qui s'en occupe : c'est la première question qu'on se pose devant la
  // carte. Le nom passe donc dans une pastille — verte dès que quelqu'un
  // a pris le comptage, ambre tant que personne ne l'a fait.
  const responsable = session?.authorName ?? null;

  const heure =
    status === 'submitted' && session?.submitted_at
      ? `Validé à ${TIME_FORMAT.format(new Date(session.submitted_at))}`
      : status === 'draft'
        ? 'Comptage commencé'
        : null;

  // Le comptage validé n'est pas la fin du travail : ce qui reste à produire
  // est la vraie information de la journée.
  const tasks = session
    ? { pending: session.pendingTasks, done: session.doneTasks }
    : { pending: 0, done: 0 };
  const totalTasks = tasks.pending + tasks.done;

  // Les deux cartes portent la journée : une ombre franche et un liseré
  // les détachent du fond crème, où elles se confondaient.
  const carte = (
      <Card
        className={cn(
          'bg-card flex flex-col justify-between gap-3.5 rounded-3xl border p-5 shadow-md transition-all',
          verrouille ? 'opacity-55 shadow-sm' : 'active:scale-[0.99] active:shadow-sm',
          status === 'submitted' && tasks.pending === 0
            ? 'border-primary/25 shadow-primary/5'
            : 'border-border/80',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">{title}</h2>

          {/* La pastille porte l'état de la journée : c'est ce qu'on cherche
              en ouvrant l'application. Un point de couleur devant le mot la
              rend lisible de loin sans avoir à l'agrandir davantage — et
              elle reste lisible pour qui distingue mal les couleurs, le mot
              disant déjà tout. */}
          {enAttente ? (
            <span className="bg-muted text-muted-foreground ring-border flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-black ring-1">
              <Clock className="size-3.5" strokeWidth={2.8} />
              {ouvreA}
            </span>
          ) : (
          <span
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-black',
              status === 'submitted'
                ? 'bg-primary/12 text-primary ring-primary/20 ring-1'
                : status === 'draft'
                  ? 'bg-alert text-alert-foreground ring-alert-border ring-1'
                  : 'bg-muted text-foreground/75 ring-border ring-1',
            )}
          >
            {status === 'submitted' ? (
              <Check className="size-3.5" strokeWidth={3.5} />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  status === 'draft' ? 'bg-alert-foreground/70' : 'bg-foreground/40',
                )}
              />
            )}
            {label}
          </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full pr-3.5 pl-1.5 text-[13px] font-bold',
              responsable
                ? 'bg-primary/12 text-primary'
                : 'bg-alert text-alert-foreground ring-alert-border ring-1',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-5 items-center justify-center rounded-full text-[11px] font-black',
                responsable
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-alert-foreground/20 text-alert-foreground',
              )}
            >
              {responsable ? responsable.trim().charAt(0).toUpperCase() : '—'}
            </span>
            {responsable ?? 'Personne'}
          </span>

          {heure ? (
            <span className="text-muted-foreground text-[13px] font-semibold">{heure}</span>
          ) : null}
        </div>

        {status === 'submitted' && totalTasks > 0 ? (
          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-2xl px-4 py-3',
              tasks.pending > 0
                ? 'bg-alert text-alert-foreground ring-alert-border ring-1'
                : 'bg-primary/10 text-primary ring-primary/20 ring-1',
            )}
          >
            <span className="text-sm font-black">
              {tasks.pending > 0
                ? `${tasks.pending} relance${tasks.pending > 1 ? 's' : ''} à produire`
                : `${tasks.done} relance${tasks.done > 1 ? 's' : ''} — tout est produit`}
            </span>
            <ChevronRight className="size-4 shrink-0" />
          </div>
        ) : null}
      </Card>
  );

  if (verrouille) {
    return (
      <div aria-disabled className="block cursor-not-allowed">
        {carte}
      </div>
    );
  }

  return (
    <Link href={`/comptage/${kind === 'morning' ? 'matin' : 'apres-midi'}`} className="block">
      {carte}
    </Link>
  );
}
