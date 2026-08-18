import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateShort, formatEuro } from '@/lib/format';
import type { SessionSummary } from '@/lib/admin/history';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function SessionsTable({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) {
    return (
      <Card className="p-8 text-center text-sm">
        Aucun comptage sur cette période.
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-3xl border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th scope="col" className="px-4 py-3 text-left font-semibold">Date</th>
            <th scope="col" className="px-3 py-3 text-left font-semibold">Session</th>
            <th scope="col" className="px-3 py-3 text-left font-semibold">Par</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Comptés</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Relances</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">CA prévu</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Durée</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">État</th>
          </tr>
        </thead>

        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} className="hover:bg-muted/30 border-b last:border-0">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                <Link href={`/admin/historique/${session.id}`} className="hover:underline">
                  {formatDateShort(session.date)}
                </Link>
              </th>
              <td className="px-3 py-2">{session.session === 'morning' ? 'Matin' : 'Après-midi'}</td>
              <td className="px-3 py-2">{session.authorName ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {session.productsCounted} / {session.productsTotal}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {session.tasksTotal === 0
                  ? '—'
                  : `${session.tasksDone} / ${session.tasksTotal}`}
              </td>
              <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                {formatEuro(session.forecastSnapshot)}
              </td>
              <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                {session.durationMinutes === null ? '—' : `${session.durationMinutes} min`}
              </td>
              <td className="px-4 py-2 text-right">
                {session.status === 'submitted' ? (
                  <span className="text-muted-foreground text-xs">
                    {session.submittedAt ? TIME.format(new Date(session.submittedAt)) : 'validé'}
                  </span>
                ) : (
                  <Badge variant="outline">en cours</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
