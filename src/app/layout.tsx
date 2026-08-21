import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { RattrapageLienActivation } from '@/components/pwa/rattrapage-lien-activation';
import { TraceurNavigation } from '@/components/pwa/traceur-navigation';
import { NouvelleVersion } from '@/components/pwa/nouvelle-version';
import { IOS_SPLASH_SCREENS, splashHref, splashMediaQuery } from '@/lib/pwa/splash-screens';

export const metadata: Metadata = {
  title: 'Lafayette — Mise en place',
  description: 'Comptage des stocks et relance de production, Poké Bowl Lafayette.',
  applicationName: 'Lafayette',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lafayette',
  },
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  // Teinte la barre d'état de Safari et le pourtour de l'application
  // installée. Elle valait encore l'ancien bleu ardoise, qui n'existe plus
  // nulle part dans l'interface.
  themeColor: '#2f7d55',
  width: 'device-width',
  initialScale: 1,
  // L'écran de comptage se manipule d'une main : on évite le zoom accidentel
  // sur les steppers, sans bloquer l'accessibilité au-delà.
  maximumScale: 5,
  // Indispensable avec l'encoche : sans `cover`, iOS laisse deux bandes
  // blanches en haut et en bas une fois l'app installée.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Next 15 n'émet que la balise standardisée `mobile-web-app-capable`.
            Les iOS antérieurs à 16.4 ne lisent que la variante préfixée : sans
            elle, l'application s'ouvre dans Safari avec la barre d'adresse au
            lieu de s'afficher en plein écran. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />

        {/* iOS n'utilise un écran de démarrage que si la media query
            correspond exactement à l'appareil. */}
        {IOS_SPLASH_SCREENS.map((screen) => (
          <link
            key={`${screen.width}x${screen.height}`}
            rel="apple-touch-startup-image"
            media={splashMediaQuery(screen)}
            href={splashHref(screen)}
          />
        ))}
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <ServiceWorkerRegistrar />
        <RattrapageLienActivation />
        <TraceurNavigation />
        <NouvelleVersion />
      </body>
    </html>
  );
}
