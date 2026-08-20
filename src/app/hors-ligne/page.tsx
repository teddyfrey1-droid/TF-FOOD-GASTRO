import { WifiOff } from 'lucide-react';

export const metadata = {
  title: 'Hors ligne — Heiko',
};

/**
 * Page servie par le service worker quand une page non mise en cache est
 * demandée sans réseau. Volontairement rassurante : les saisies déjà faites
 * ne sont pas perdues.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        <WifiOff className="text-muted-foreground size-8" />
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Pas de réseau</h1>

      <p className="text-muted-foreground mt-3 max-w-sm text-sm">
        Cette page n&apos;est pas encore disponible hors ligne. Les comptages déjà ouverts, eux,
        restent utilisables.
      </p>

      <p className="text-muted-foreground mt-6 max-w-sm text-sm">
        <strong className="text-foreground">Vos saisies sont conservées</strong> sur le téléphone et
        partiront automatiquement au retour du réseau.
      </p>
    </main>
  );
}
