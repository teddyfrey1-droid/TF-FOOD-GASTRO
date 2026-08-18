import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Connexion — MEP',
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
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">MEP</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Mise en place — Heiko Poké Bowl Lafayette
          </p>
        </header>

        <Suspense>
          <LoginForm suite={suite} />
        </Suspense>
      </div>
    </main>
  );
}
