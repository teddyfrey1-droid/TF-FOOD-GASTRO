import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SessionKind, SessionStatus } from '@/lib/supabase/database.types';

const TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

interface SessionSummary {
  id: string;
  status: SessionStatus;
  submitted_at: string | null;
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

  const label =
    status === 'submitted'
      ? `Fait à ${session?.submitted_at ? TIME_FORMAT.format(new Date(session.submitted_at)) : '—'}`
      : status === 'draft'
        ? 'En cours'
        : 'À faire';

  return (
    <Link href={`/comptage/${kind === 'morning' ? 'matin' : 'apres-midi'}`} className="block">
      <Card className="hover:bg-accent/50 flex min-h-32 flex-col justify-between gap-3 p-5 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant={status === 'submitted' ? 'secondary' : 'default'}>{label}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </Card>
    </Link>
  );
}
