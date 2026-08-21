'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rouvrirComptage } from '@/app/comptage/annuler';

/**
 * Rouvrir un comptage validé, d'un appui.
 *
 * On s'aperçoit d'une erreur en rangeant, ou un bac réapparaît derrière
 * une pile. Le comptage était scellé : il fallait attendre le service
 * suivant, ou vivre avec un rapport faux.
 *
 * Une confirmation, parce que la liste de relance sera recalculée — les
 * relances déjà cochées repartent à zéro, et il vaut mieux le savoir
 * avant qu'après.
 */
export function BoutonRouvrir({ sessionId, href }: { sessionId: string; href: string }) {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [pending, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (!confirme) {
    return (
      <Button
        variant="ghost"
        onClick={() => setConfirme(true)}
        className="mt-8 h-12 w-full font-bold"
      >
        <Undo2 className="size-4" strokeWidth={2.6} />
        Revenir au comptage
      </Button>
    );
  }

  return (
    <div className="bg-muted/60 mt-8 space-y-3 rounded-2xl p-4">
      <p className="text-[13px] leading-relaxed font-semibold">
        Reprendre la saisie ? Les quantités sont conservées, mais la liste de relance sera
        recalculée à la prochaine validation — les relances déjà cochées repartent à zéro.
      </p>

      {erreur ? <p className="text-destructive text-[12px] font-bold">{erreur}</p> : null}

      <div className="flex gap-2">
        <Button
          disabled={pending}
          className="h-11 flex-1 rounded-xl font-bold"
          onClick={() =>
            demarrer(async () => {
              const resultat = await rouvrirComptage(sessionId);
              if (resultat.error) {
                setErreur(resultat.error);
                return;
              }
              router.push(href);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Oui, reprendre
        </Button>
        <Button variant="ghost" className="h-11" onClick={() => setConfirme(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
