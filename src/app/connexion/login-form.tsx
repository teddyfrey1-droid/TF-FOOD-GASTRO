'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { signIn, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-13 w-full rounded-2xl text-base font-bold"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          Connexion…
        </>
      ) : (
        'Se connecter'
      )}
    </Button>
  );
}

export function LoginForm({ suite }: { suite?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {});
  const [visible, setVisible] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {suite ? <input type="hidden" name="suite" value={suite} /> : null}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-semibold">
          Adresse e-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="prenom@heiko.fr"
          className="h-13 rounded-2xl px-4 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-semibold">
          Mot de passe
        </Label>

        <div className="relative">
          <Input
            id="password"
            name="password"
            // Le champ bascule en clair : sur un téléphone, avec des doigts
            // humides, une faute de frappe invisible est la première cause
            // d'échec de connexion.
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="h-13 rounded-2xl px-4 pr-14 text-base"
          />

          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={visible}
            // Cible tactile de 48 px, comme partout ailleurs dans l'app.
            className={cn(
              'absolute top-1/2 right-1 flex size-12 -translate-y-1/2 items-center justify-center',
              'text-muted-foreground hover:text-foreground rounded-xl transition-colors',
              'touch-manipulation no-select',
            )}
          >
            {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm font-medium"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-muted-foreground pt-2 text-center text-xs leading-relaxed">
        Mot de passe oublié ? Demandez à votre directeur de le réinitialiser.
      </p>
    </form>
  );
}
