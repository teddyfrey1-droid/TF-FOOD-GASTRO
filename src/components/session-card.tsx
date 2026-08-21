import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
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
  description,
  session,
}: {
  kind: SessionKind;
  title: string;
  description: string;
  session: SessionSummary | null;
}) {
  const status = session?.status ?? null;

  const label = status === 'submitted' ? 'Fait' : status === 'draft' ? 'En cours' : 'À faire';

  // « Fait à 08h42 par Karim » : l'employé doit voir d'un coup d'œil si
  // quelqu'un s'en est déjà chargé.
  const detail =
    status === 'submitted'
      ? [
          session?.submitted_at ? `à ${TIME_FORMAT.format(new Date(session.submitted_at))}` : null,
          session?.authorName ? `par ${session.authorName}` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : status === 'draft'
        ? session?.authorName
          ? `Commencé par ${session.authorName}`
          : 'Commencé'
        : null;

  // Le comptage validé n'est pas la fin du travail : ce qui reste à produire
  // est la vraie information de la journée.
  const tasks = session
    ? { pending: session.pendingTasks, done: session.doneTasks }
    : { pending: 0, done: 0 };
  const totalTasks = tasks.pending + tasks.done;

  return (
    <Link href={`/comptage/${kind === 'morning' ? 'matin' : 'apres-midi'}`} className="block">
      <Card
        className={cn(
          'bg-card flex min-h-36 flex-col justify-between gap-3 rounded-3xl p-6 transition-transform active:scale-[0.99]',
          status === 'submitted' && tasks.pending === 0 && 'opacity-70',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">{title}</h2>

          {/* La pastille porte l'état de la journée : c'est ce qu'on cherche
              en ouvrant l'application. Un point de couleur devant le mot la
              rend lisible de loin sans avoir à l'agrandir davantage — et
              elle reste lisible pour qui distingue mal les couleurs, le mot
              disant déjà tout. */}
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
        </div>

        <div>
          <p className="text-muted-foreground text-sm">{description}</p>
          {detail ? (
            <p className="text-muted-foreground mt-1 text-sm font-medium">{detail}</p>
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
    </Link>
  );
}
