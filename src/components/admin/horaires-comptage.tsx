'use client';

import { useState, useTransition } from 'react';
import { Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { reglerHeuresComptage } from '@/app/admin/actions-horaires';

/**
 * Les heures d'ouverture des deux comptages.
 *
 * Elles décident de deux choses à la fois : quand la carte cesse d'être
 * grisée sur l'accueil, et quand le rappel part sur les téléphones. Un
 * seul réglage pour les deux — sinon ils divergent, et l'équipe reçoit
 * une notification pour un comptage encore fermé.
 */
export function HorairesComptage({
  morning,
  afternoon,
}: {
  morning: string;
  afternoon: string;
}) {
  const [matin, setMatin] = useState(morning.slice(0, 5));
  const [apresMidi, setApresMidi] = useState(afternoon.slice(0, 5));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const modifie = matin !== morning.slice(0, 5) || apresMidi !== afternoon.slice(0, 5);

  return (
    <Card className="rounded-3xl p-5">
      <h2 className="flex items-center gap-2 text-[17px] font-black">
        <Clock className="size-4.5" strokeWidth={2.6} />
        Horaires des comptages
      </h2>
      <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
        Avant l&apos;heure, la carte du comptage reste grisée pour l&apos;équipe — un comptage
        lancé trop tôt décrit des frigos qui n&apos;ont pas encore vécu la journée. C&apos;est
        aussi l&apos;heure à laquelle part le rappel. L&apos;encadrement peut toujours ouvrir
        avant, si le service déborde.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="heure-matin" className="text-xs font-bold">
            Matin
          </Label>
          <Input
            id="heure-matin"
            type="time"
            value={matin}
            onChange={(evenement) => setMatin(evenement.target.value)}
            className="h-12 w-32 rounded-xl text-center text-lg font-black tabular-nums"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="heure-apres-midi" className="text-xs font-bold">
            Après-midi
          </Label>
          <Input
            id="heure-apres-midi"
            type="time"
            value={apresMidi}
            onChange={(evenement) => setApresMidi(evenement.target.value)}
            className="h-12 w-32 rounded-xl text-center text-lg font-black tabular-nums"
          />
        </div>

        <Button
          disabled={pending || !modifie}
          className="h-12 rounded-xl font-bold"
          onClick={() =>
            startTransition(async () => {
              const resultat = await reglerHeuresComptage(matin, apresMidi);
              setMessage(resultat.error ?? 'Horaires enregistrés.');
            })
          }
        >
          <Check className="size-4" />
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {message ? <p className="text-muted-foreground mt-3 text-xs font-semibold">{message}</p> : null}
    </Card>
  );
}
