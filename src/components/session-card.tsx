import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SessionKind, SessionStatus } from '@/lib/supabase/database.types';

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

interface SessionSummary {
  id: string;
  status: SessionStatus;
  submitted_at: string | null;
  authorName: string | null;
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

  return (
    <Link href={`/comptage/${kind === 'morning' ? 'matin' : 'apres-midi'}`} className="block">
      <Card
        className={cn(
          'bg-card flex min-h-36 flex-col justify-between gap-3 rounded-3xl p-6 transition-transform active:scale-[0.99]',
          status === 'submitted' && 'opacity-70',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-bold',
              status === 'submitted'
                ? 'bg-primary/10 text-primary'
                : status === 'draft'
                  ? 'bg-alert text-alert-foreground'
                  : 'bg-foreground text-background',
            )}
          >
            {label}
          </span>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">{description}</p>
          {detail ? (
            <p className="text-muted-foreground mt-1 text-sm font-medium">{detail}</p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
