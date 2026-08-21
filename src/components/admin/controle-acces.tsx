'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
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
    <Card className="rounded-3xl p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-black">
        <ShieldCheck className="size-4.5" strokeWidth={2.6} />
        Contrôle d&apos;accès
      </h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
        Ce que chaque statut peut ouvrir. Les changements prennent effet tout de suite, sur les
        téléphones comme dans la base.
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
              <span aria-hidden className="text-lg leading-none">
                {droit.emoji}
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
              <span aria-hidden className="text-base leading-none">
                {verrou.emoji}
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
    </Card>
  );
}
