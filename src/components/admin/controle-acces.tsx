'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ROLE_LABELS } from '@/lib/roles';
import { DROITS, DROITS_VERROUILLES, STATUTS_REGLABLES } from '@/lib/droits';
import { reglerDroit } from '@/app/admin/actions-droits';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/supabase/database.types';

/** Une clé de la forme « permission:role ». */
type Cle = string;

export interface EtatDroits {
  [cle: Cle]: boolean;
}

/**
 * Qui a le droit de quoi, en un écran d'interrupteurs.
 *
 * Chaque ligne est un accès, chaque colonne un statut. L'interrupteur
 * bascule tout de suite — sans bouton « Enregistrer » — et la ligne
 * annonce ce qui vient de changer. Un réglage qu'on ne voit pas prendre
 * effet, on le refait trois fois en doutant.
 *
 * Le directeur et le propriétaire n'ont pas de colonne : ils ont tout,
 * en dur dans la base. Aucune combinaison ne peut les enfermer dehors.
 */
export function ControleAcces({ initial }: { initial: EtatDroits }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // Replié par défaut : on règle les droits le jour où quelqu'un change
  // de poste, pas tous les matins. Déplié, le tableau poussait tout le
  // reste de Gestion hors de l'écran.
  const [ouvert, setOuvert] = useState(false);

  // L'interrupteur suit le doigt, puis le serveur confirme. Sur un
  // téléphone en cuisine, un demi-second de latence donne l'impression
  // que l'appui n'a pas été pris.
  const [droits, appliquer] = useOptimistic(
    initial,
    (actuel: EtatDroits, changement: { cle: Cle; valeur: boolean }) => ({
      ...actuel,
      [changement.cle]: changement.valeur,
    }),
  );

  function basculer(permission: string, role: UserRole, valeur: boolean, titre: string) {
    const cle = `${permission}:${role}`;
    startTransition(async () => {
      appliquer({ cle, valeur });
      const resultat = await reglerDroit(permission, role, valeur);
      setMessage(
        resultat.error ??
          `${titre} — ${valeur ? 'ouvert' : 'fermé'} pour ${ROLE_LABELS[role].toLowerCase()}.`,
      );
    });
  }

  return (
    <Card className="overflow-hidden rounded-3xl p-0">
      <button
        type="button"
        onClick={() => setOuvert((actuel) => !actuel)}
        aria-expanded={ouvert}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-5 py-4 text-left transition-colors"
      >
        <span
          aria-hidden
          className="bg-muted text-foreground/70 flex size-11 shrink-0 items-center justify-center rounded-xl"
        >
          <ShieldCheck className="size-5" strokeWidth={2.2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-tight font-bold">Contrôle d&apos;accès</span>
          <span className="text-muted-foreground mt-0.5 block text-[13px] font-medium">
            Ce que chaque statut peut ouvrir
          </span>
        </span>

        <ChevronDown
          className={cn(
            'text-muted-foreground/60 size-5 shrink-0 transition-transform',
            ouvert && 'rotate-180',
          )}
          strokeWidth={2.5}
        />
      </button>

      {ouvert ? (
      <div className="border-t px-5 pt-4 pb-5">
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        Les changements prennent effet tout de suite, sur les téléphones comme dans la base.
      </p>

      {/* L'en-tête des colonnes, une fois pour toutes. */}
      <div className="text-muted-foreground mt-4 flex items-end gap-2 border-b pb-2 text-[10px] font-black tracking-wide uppercase">
        <span className="min-w-0 flex-1">Accès</span>
        {STATUTS_REGLABLES.map((role) => (
          <span key={role} className="w-[4.5rem] text-center leading-tight">
            {role === 'assistant_manager' ? 'Assistant manager' : 'Salarié'}
          </span>
        ))}
      </div>

      <ul className="divide-y">
        {DROITS.map((droit) => (
          <li key={droit.cle} className="flex items-center gap-2 py-3">
            <span className="flex min-w-0 flex-1 items-start gap-2.5">
              <span
                aria-hidden
                className="bg-muted text-foreground/70 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
              >
                <droit.icone className="size-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] leading-tight font-bold">{droit.titre}</span>
                <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
                  {droit.description}
                </span>
              </span>
            </span>

            {STATUTS_REGLABLES.map((role) => {
              const reglable = droit.reglablePour.includes(role);
              const cle = `${droit.cle}:${role}`;

              return (
                <span key={role} className="flex w-[4.5rem] justify-center">
                  {reglable ? (
                    <Switch
                      checked={droits[cle] ?? false}
                      disabled={pending}
                      aria-label={`${droit.titre} — ${ROLE_LABELS[role]}`}
                      onCheckedChange={(coche) =>
                        basculer(droit.cle, role, coche, droit.titre)
                      }
                    />
                  ) : (
                    // Pas d'interrupteur du tout : le simulateur affiche
                    // les cibles, et la base refuse de l'ouvrir à un
                    // salarié. Un interrupteur grisé laisserait croire
                    // que c'est négociable.
                    <span
                      title="Impossible pour ce statut"
                      className="text-muted-foreground/40 flex size-6 items-center justify-center"
                    >
                      <Lock className="size-3.5" strokeWidth={2.5} />
                    </span>
                  )}
                </span>
              );
            })}
          </li>
        ))}
      </ul>

      {message ? (
        <p
          role="status"
          className={cn(
            'mt-3 rounded-xl px-3 py-2 text-[12px] font-bold',
            message.includes('—') ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
          )}
        >
          {message}
        </p>
      ) : null}

      {/* Ce qui ne se règle pas, et pourquoi. Le montrer vaut mieux que
          de laisser chercher un interrupteur qui n'existera jamais. */}
      <div className="mt-5 border-t pt-4">
        <p className="text-muted-foreground mb-2 text-[10px] font-black tracking-wide uppercase">
          Toujours réservé au directeur
        </p>
        <ul className="space-y-2">
          {DROITS_VERROUILLES.map((verrou) => (
            <li key={verrou.titre} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="bg-muted text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
              >
                <verrou.icone className="size-4" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                  {verrou.titre}
                  <Lock className="text-muted-foreground/60 size-3" strokeWidth={2.8} />
                </span>
                <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">
                  {verrou.description}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      </div>
      ) : null}
    </Card>
  );
}
