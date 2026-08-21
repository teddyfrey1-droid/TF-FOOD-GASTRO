import { Card } from '@/components/ui/card';
import type { SessionSummary } from '@/lib/admin/history';

/**
 * Qui compte, combien de fois, et en combien de temps.
 *
 * Utile pour deux décisions concrètes : repérer qui porte les comptages
 * seul, et repérer un temps de comptage anormalement court — signe qu'on
 * a validé sans descendre au frigo du bas.
 */
export function HistoriqueParPersonne({ sessions }: { sessions: SessionSummary[] }) {
  const valides = sessions.filter((session) => session.status === 'submitted');

  const parPersonne = new Map<
    string,
    { comptages: number; durees: number[]; relances: number; faites: number }
  >();

  for (const session of valides) {
    const nom = session.authorName ?? 'Compte supprimé';
    const ligne = parPersonne.get(nom) ?? { comptages: 0, durees: [], relances: 0, faites: 0 };
    ligne.comptages += 1;
    if (session.durationMinutes !== null && session.durationMinutes > 0) {
      ligne.durees.push(session.durationMinutes);
    }
    ligne.relances += session.tasksTotal;
    ligne.faites += session.tasksDone;
    parPersonne.set(nom, ligne);
  }

  const lignes = [...parPersonne.entries()].sort((a, b) => b[1].comptages - a[1].comptages);

  if (lignes.length === 0) return null;

  return (
    <Card className="rounded-3xl p-5">
      <h2 className="text-[17px] font-black">Qui a compté</h2>
      <p className="text-muted-foreground mt-0.5 text-[13px]">
        Sur les comptages validés de la période.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-md text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-[11px] font-black tracking-wide uppercase">
              <th className="pb-2 font-black">Personne</th>
              <th className="pb-2 text-right font-black">Comptages</th>
              <th className="pb-2 text-right font-black">Durée moy.</th>
              <th className="pb-2 text-right font-black">Relances faites</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(([nom, ligne]) => {
              const moyenne =
                ligne.durees.length > 0
                  ? Math.round(
                      ligne.durees.reduce((total, duree) => total + duree, 0) / ligne.durees.length,
                    )
                  : null;

              return (
                <tr key={nom} className="border-t">
                  <td className="py-2.5 font-bold">{nom}</td>
                  <td className="py-2.5 text-right font-black tabular-nums">{ligne.comptages}</td>
                  <td className="text-muted-foreground py-2.5 text-right font-semibold tabular-nums">
                    {moyenne === null ? '—' : `${moyenne} min`}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">
                    {ligne.relances === 0 ? '—' : `${ligne.faites} / ${ligne.relances}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
