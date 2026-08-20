import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Connexion — Heiko',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-9 text-center">
          {/* Pastille de marque : l'app s'ouvre depuis l'écran d'accueil, on
              doit reconnaître où on est en un dixième de seconde. */}
          <div
            aria-hidden
            className="bg-primary mx-auto flex size-16 items-center justify-center rounded-3xl text-3xl shadow-sm"
          >
            🥗
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight">Mise en place</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Heiko Poké Bowl · Lafayette</p>
        </header>

        <div className="bg-card rounded-3xl border p-6 shadow-sm">
          <Suspense>
            <LoginForm suite={suite} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
