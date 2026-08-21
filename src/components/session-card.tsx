'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Clock, Loader2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { annulerComptage } from '@/app/comptage/annuler';
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
}: {
  kind: SessionKind;
  title: string;
  session: SessionSummary | null;
  /** Heure d'ouverture « HH:MM », si elle n'est pas encore passée. */
  ouvreA?: string | null;
}) {
  const status = session?.status ?? null;

  // Un comptage lancé trop tôt décrit des frigos qui n'ont pas encore
  // vécu la journée : avant l'heure, la carte est fermée pour TOUT LE
  // MONDE. L'encadrement passait outre jusqu'ici ; en pratique le
  // réglage semblait ne servir à rien, puisque celui qui le pose est
  // précisément celui qui pouvait l'ignorer.
  //
  // La condition ne regarde plus si un comptage existe : un comptage
  // déjà commencé avant l'heure rouvrait la carte, ce qui vidait le
  // réglage de son sens dès le premier essai.
  const verrouille = Boolean(ouvreA) && status !== 'submitted';

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
          'flex flex-col justify-between gap-3.5 rounded-3xl border p-5 transition-all',
          // Fermée : tout passe en gris, y compris les pastilles de
          // couleur. Une carte à moitié colorée se lit encore comme
          // disponible ; celle-ci doit se voir fermée d'un coup d'œil.
          verrouille
            ? 'bg-muted/50 border-border/60 shadow-none grayscale [&_*]:!text-muted-foreground'
            : 'bg-card shadow-md active:scale-[0.99] active:shadow-sm',
          !verrouille && status === 'submitted' && tasks.pending === 0
            ? 'border-primary/25 shadow-primary/5'
            : !verrouille && 'border-border/80',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">{title}</h2>

          {/* La pastille porte l'état de la journée : c'est ce qu'on cherche
              en ouvrant l'application. Un point de couleur devant le mot la
              rend lisible de loin sans avoir à l'agrandir davantage — et
              elle reste lisible pour qui distingue mal les couleurs, le mot
              disant déjà tout. */}
          {verrouille ? (
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

        {verrouille ? (
          <p className="text-muted-foreground text-[13px] font-semibold">
            Ce comptage ouvre à {ouvreA}.
          </p>
        ) : (
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

          {/* Un comptage abandonné bloque la journée au nom de quelqu'un
              qui ne le finira pas. Un appui le rend à l'équipe. */}
          {status === 'draft' && session ? (
            <BoutonAnnuler sessionId={session.id} />
          ) : null}
        </div>
        )}

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

/**
 * Rend un comptage commencé à l'équipe.
 *
 * Un employé ouvre le comptage, saisit trois produits, puis part en
 * livraison : la journée reste bloquée sur « En cours » à son nom, et le
 * collègue qui prend la suite hérite d'un relevé partiel dont il ne sait
 * pas ce qu'il vaut. Mieux vaut repartir de zéro que de continuer à
 * l'aveugle — mais c'est destructeur, d'où la confirmation.
 *
 * Le bouton vit à l'intérieur d'un lien : sans `preventDefault`, chaque
 * appui ouvrirait aussi le comptage qu'on cherche à annuler.
 */
function BoutonAnnuler({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [pending, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function arreter(evenement: React.MouseEvent) {
    evenement.preventDefault();
    evenement.stopPropagation();
  }

  if (!confirme) {
    return (
      <button
        type="button"
        onClick={(evenement) => {
          arreter(evenement);
          setConfirme(true);
        }}
        className="text-muted-foreground hover:text-destructive ml-auto flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold transition-colors"
      >
        <X className="size-3.5" strokeWidth={3} />
        Annuler
      </button>
    );
  }

  return (
    <span className="ml-auto flex items-center gap-1.5">
      {erreur ? (
        <span className="text-destructive text-[11px] font-bold">{erreur}</span>
      ) : (
        <span className="text-muted-foreground text-[11px] font-bold">Tout effacer ?</span>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={(evenement) => {
          arreter(evenement);
          demarrer(async () => {
            const resultat = await annulerComptage(sessionId);
            if (resultat.error) {
              setErreur(resultat.error);
              return;
            }
            setConfirme(false);
            router.refresh();
          });
        }}
        className="bg-destructive text-destructive-foreground flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-black"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : null}
        Oui
      </button>

      <button
        type="button"
        onClick={(evenement) => {
          arreter(evenement);
          setConfirme(false);
          setErreur(null);
        }}
        className="text-muted-foreground h-8 rounded-full px-2 text-[12px] font-bold"
      >
        Non
      </button>
    </span>
  );
}
