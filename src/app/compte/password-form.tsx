'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeOwnPassword, type PasswordState } from './actions';

function Field({
  id,
  name,
  label,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="h-12 rounded-2xl px-4 pr-14 text-base"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={visible}
          className="text-muted-foreground hover:text-foreground no-select absolute top-1/2 right-1 flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-xl transition-colors"
        >
          {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-12 w-full rounded-2xl font-bold">
      {pending ? 'Changement…' : 'Changer le mot de passe'}
    </Button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState<PasswordState, FormData>(changeOwnPassword, {});

  return (
    <form action={formAction} className="space-y-4" key={state.success ? 'done' : 'form'}>
      <Field id="current" name="current" label="Mot de passe actuel" autoComplete="current-password" />
      <Field id="next" name="next" label="Nouveau mot de passe" autoComplete="new-password" />
      <Field id="confirm" name="confirm" label="Confirmer" autoComplete="new-password" />

      {state.error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="bg-primary/10 text-primary rounded-xl px-4 py-3 text-sm font-medium">
          {state.success}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
