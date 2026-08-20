import { Suspense } from 'react';
import { DefinirMotDePasse } from './formulaire';

export const metadata = { title: 'Choisir mon mot de passe — Lafayette' };

export default function PageDefinirMotDePasse() {
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
          <p className="text-muted-foreground mt-1.5 text-sm">
            Choisissez le mot de passe qui vous servira à vous connecter.
          </p>
        </header>

        <div className="bg-card rounded-3xl border p-6 shadow-sm">
          {/* Le formulaire lit le jeton dans l'adresse : sans cette
              frontière, Next refuse de prérendre la page. */}
          <Suspense
            fallback={
              <p className="text-muted-foreground py-6 text-center text-sm">
                Vérification du lien…
              </p>
            }
          >
            <DefinirMotDePasse />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
