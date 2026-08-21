import { FormulaireActivation } from './formulaire';

export const metadata = { title: 'Activer mon compte — Lafayette' };

export default function PageActivation() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8 text-center">
          <div
            aria-hidden
            className="bg-primary mx-auto flex size-16 items-center justify-center rounded-3xl text-3xl shadow-sm"
          >
            🥗
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight">Bienvenue</h1>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
            Votre directeur vous a donné un code. Saisissez-le ici avec votre adresse e-mail
            pour choisir votre mot de passe.
          </p>
        </header>

        <div className="bg-card rounded-3xl border p-6 shadow-sm">
          <FormulaireActivation />
        </div>
      </div>
    </main>
  );
}
