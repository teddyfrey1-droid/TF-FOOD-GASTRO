'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import type { SessionKind } from '@/lib/supabase/database.types';

/** Les filtres vivent dans l'URL : un lien vers une période reste partageable. */
export function HistoryFiltersBar({
  from,
  to,
  session,
  employe,
  team,
}: {
  from: string;
  to: string;
  session?: SessionKind;
  employe?: string;
  team: Array<{ id: string; full_name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`?${next.toString()}`);
  }

  return (
    <Card className="flex flex-wrap items-end gap-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="du">Du</Label>
        <Input
          id="du"
          type="date"
          defaultValue={from}
          max={to}
          onChange={(event) => setParam('du', event.target.value)}
          className="h-9 w-40"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="au">Au</Label>
        <Input
          id="au"
          type="date"
          defaultValue={to}
          min={from}
          onChange={(event) => setParam('au', event.target.value)}
          className="h-9 w-40"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="session">Session</Label>
        <select
          id="session"
          defaultValue={session ?? ''}
          onChange={(event) => setParam('session', event.target.value || undefined)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Toutes</option>
          <option value="morning">Matin</option>
          <option value="afternoon">Après-midi</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="employe">Employé</Label>
        <select
          id="employe"
          defaultValue={employe ?? ''}
          onChange={(event) => setParam('employe', event.target.value || undefined)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Tous</option>
          {team.map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}
