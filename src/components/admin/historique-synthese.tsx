import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SessionSummary } from '@/lib/admin/history';

/**
 * Ce que dit la période, avant d'entrer dans le détail.
 *
 * Le tableau des comptages répond à « qu'est-ce qui s'est passé le 14 » ;
 * il ne répond pas à « est-ce que l'équipe compte vraiment tous les
 * jours ». C'est pourtant la question qu'on se pose en ouvrant l'écran.
 *
 * Tout est calculé à partir des comptages déjà chargés : pas une requête
 * de plus.
 */
export function HistoriqueSynthese({
  sessions,
  joursAttendus,
}: {
  sessions: SessionSummary[];
  /** Journées révolues sur la période : deux comptages attendus par jour. */
  joursAttendus: number;
}) {
  const valides = sessions.filter((session) => session.status === 'submitted');
  const attendus = joursAttendus * 2;

  const assiduite = attendus > 0 ? Math.round((valides.length / attendus) * 100) : null;

  const relancesDemandees = valides.reduce((total, session) => total + session.tasksTotal, 0);
  const relancesFaites = valides.reduce((total, session) => total + session.tasksDone, 0);
  const tauxRelances =
    relancesDemandees > 0 ? Math.round((relancesFaites / relancesDemandees) * 100) : null;

  const critiques = valides.reduce((total, session) => total + session.tasksCritical, 0);
  const reportes = valides.reduce((total, session) => total + session.productsDeferred, 0);

  const durees = valides
    .map((session) => session.durationMinutes)
    .filter((duree): duree is number => duree !== null && duree > 0);
  const dureeMoyenne =
    durees.length > 0
      ? Math.round(durees.reduce((total, duree) => total + duree, 0) / durees.length)
      : null;

  // Une journée n'est complète qu'avec ses deux comptages validés.
  const parJour = new Map<string, number>();
  for (const session of valides) {
    parJour.set(session.date, (parJour.get(session.date) ?? 0) + 1);
  }
  const joursComplets = [...parJour.values()].filter((nombre) => nombre >= 2).length;

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Chiffre
        libelle="Comptages validés"
        valeur={`${valides.length}`}
        detail={attendus > 0 ? `sur ${attendus} attendus` : 'sur la période'}
        pourcentage={assiduite}
        seuil={90}
      />
      <Chiffre
        libelle="Journées complètes"
        valeur={`${joursComplets}`}
        detail={joursAttendus > 0 ? `sur ${joursAttendus} jours` : 'matin + après-midi'}
        pourcentage={joursAttendus > 0 ? Math.round((joursComplets / joursAttendus) * 100) : null}
        seuil={90}
      />
      <Chiffre
        libelle="Relances produites"
        valeur={tauxRelances === null ? '—' : `${tauxRelances} %`}
        detail={
          relancesDemandees > 0
            ? `${relancesFaites} sur ${relancesDemandees} demandées`
            : 'aucune relance demandée'
        }
        pourcentage={tauxRelances}
        seuil={85}
      />
      <Chiffre
        libelle="Durée moyenne"
        valeur={dureeMoyenne === null ? '—' : `${dureeMoyenne} min`}
        detail={durees.length > 0 ? `sur ${durees.length} comptages` : 'aucune durée mesurée'}
      />

      {critiques > 0 || reportes > 0 ? (
        <Card className="col-span-2 rounded-2xl p-4 lg:col-span-4">
          <p className="text-[13px] leading-relaxed font-semibold">
            {critiques > 0 ? (
              <>
                <span className="text-destructive font-black tabular-nums">{critiques}</span>{' '}
                relance{critiques > 1 ? 's sont parties' : ' est partie'} sous le seuil critique
                sur la période — le produit était presque à zéro au moment du comptage.
              </>
            ) : null}
            {critiques > 0 && reportes > 0 ? ' ' : null}
            {reportes > 0 ? (
              <>
                <span className="font-black tabular-nums">{reportes}</span> produit
                {reportes > 1 ? 's ont été reportés' : ' a été reporté'} à plus tard, avec un
                motif.
              </>
            ) : null}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Chiffre({
  libelle,
  valeur,
  detail,
  pourcentage,
  seuil,
}: {
  libelle: string;
  valeur: string;
  detail: string;
  /** Sert uniquement à colorer : sous le seuil, le chiffre s'assombrit. */
  pourcentage?: number | null;
  seuil?: number;
}) {
  const enRetard =
    pourcentage !== null && pourcentage !== undefined && seuil !== undefined && pourcentage < seuil;

  return (
    <Card className="rounded-2xl p-4">
      <p className="text-muted-foreground text-[11px] font-black tracking-wide uppercase">
        {libelle}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl leading-none font-black tabular-nums',
          enRetard ? 'text-destructive' : 'text-foreground',
        )}
      >
        {valeur}
      </p>
      <p className="text-muted-foreground mt-1 text-[11px] font-medium">{detail}</p>
    </Card>
  );
}
