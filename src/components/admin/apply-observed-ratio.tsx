'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { saveRatioRule } from '@/app/admin/calculateur/actions';
import { roundToNearestStep } from '@/lib/mep';

/**
 * « Appliquer le ratio constaté » (§7.3). Le passage en mode ratio est une
 * décision de réglage : on demande confirmation, avec la valeur exacte qui
 * sera écrite.
 */
export function ApplyObservedRatioButton({
  productId,
  productName,
  observedPer1000,
}: {
  productId: string;
  productName: string;
  observedPer1000: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Le ratio pilote une cible en gastros : on le cale sur le quart de gastro
  // pour rester lisible sans perdre trop de précision.
  const rounded = roundToNearestStep(observedPer1000, 0.25);

  if (done) {
    return <span className="text-muted-foreground text-xs">appliqué</span>;
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" className="text-xs" onClick={() => setConfirming(true)}>
        Appliquer
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-muted-foreground text-xs">
        {productName} → {rounded.toLocaleString('fr-FR')} / 1 000 € ?
      </span>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await saveRatioRule({ productId, qtyPer1000Eur: rounded });
            if (result.error) setError(result.error);
            else setDone(true);
            setConfirming(false);
          })
        }
      >
        Confirmer
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Non
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </div>
  );
}
