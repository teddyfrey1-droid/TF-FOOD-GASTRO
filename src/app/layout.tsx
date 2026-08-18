import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MEP — Mise en place',
  description: 'Comptage des stocks et relance de production, Heiko Poké Bowl Lafayette.',
  applicationName: 'MEP',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MEP',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  // L'écran de comptage se manipule d'une main : on évite le zoom accidentel
  // sur les steppers, sans bloquer l'accessibilité au-delà.
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
