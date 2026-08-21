'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { activerAvecCode } from './actions';

/**
 * Activation par code, sans aucun lien.
 *
 * Le code est saisi tel qu'il a été dicté : avec ou sans tiret, en
 * minuscules si le clavier du téléphone en a décidé ainsi. Il est rangé
 * côté serveur avant comparaison — refuser pour une casse serait une
 * brimade envers quelqu'un qui recopie ce qu'on vient de lui lire.
 */
export function FormulaireActivation() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [etat, action] = useActionState(activerAvecCode, {});

  if (etat.success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-primary text-lg font-black">C&apos;est fait.</p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Votre mot de passe est enregistré. Vous pouvez vous connecter avec votre adresse
          e-mail.
        </p>
        <Link
          href="/connexion"
          className={buttonVariants({ className: 'h-13 w-full rounded-2xl text-base font-bold' })}
          onClick={() => router.refresh()}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-semibold">
          Votre adresse e-mail
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          className="h-13 rounded-2xl px-4 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="code" className="text-sm font-semibold">
          Code d&apos;activation
        </Label>
        <Input
          id="code"
          name="code"
          required
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="XXXX-XXXX"
          className="h-13 rounded-2xl px-4 text-center font-mono text-xl font-black tracking-widest"
        />
        <p className="text-muted-foreground text-xs">
          Les tirets et les majuscules n&apos;ont pas d&apos;importance.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="motDePasse" className="text-sm font-semibold">
          Choisissez votre mot de passe
        </Label>
        <div className="relative">
          <Input
            id="motDePasse"
            name="motDePasse"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            autoCapitalize="none"
            minLength={8}
            required
            className="h-13 rounded-2xl px-4 pr-14 text-base"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={visible}
            className="text-muted-foreground hover:text-foreground no-select absolute top-1/2 right-1 flex size-12 -translate-y-1/2 touch-manipulation items-center justify-center rounded-xl transition-colors"
          >
            {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        <p className="text-muted-foreground text-xs">Au moins 8 caractères.</p>
      </div>

      {etat.error ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          {etat.error}
        </p>
      ) : null}

      <BoutonValider />

      <Link
        href="/connexion"
        className={buttonVariants({ variant: 'ghost', className: 'h-11 w-full' })}
      >
        Retour à la connexion
      </Link>
    </form>
  );
}

function BoutonValider() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-13 w-full rounded-2xl text-base font-bold"
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : 'Activer mon compte'}
    </Button>
  );
}
