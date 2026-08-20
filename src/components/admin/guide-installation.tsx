'use client';

import { useEffect, useState } from 'react';
import { Check, Share, SquarePlus, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';

type Situation =
  | 'chargement'
  | 'deja-installee'
  | 'ios-safari'
  | 'ios-autre-navigateur'
  | 'android'
  | 'ordinateur';

/**
 * Guide d'installation, adapté à l'appareil qui regarde.
 *
 * Sur iPhone, « Ajouter à l'écran d'accueil » n'existe QUE dans Safari.
 * Ouvert depuis un message, un mail ou WhatsApp, le lien s'affiche dans un
 * navigateur intégré qui ne propose pas l'option — et rien ne l'explique.
 * C'est de très loin la cause la plus fréquente du « je ne trouve pas ».
 */
function detecter(): Situation {
  if (typeof window === 'undefined') return 'chargement';

  const enStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS n'implémente pas `display-mode` : il expose ce drapeau.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (enStandalone) return 'deja-installee';

  const ua = window.navigator.userAgent;
  const estIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS se fait passer pour un Mac depuis iOS 13.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (estIOS) {
    // Sur iOS, tous les navigateurs utilisent WebKit : c'est la présence des
    // marqueurs des autres applications qui les distingue de Safari.
    const estAutreNavigateur = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua);
    return estAutreNavigateur ? 'ios-autre-navigateur' : 'ios-safari';
  }

  if (/Android/.test(ua)) return 'android';
  return 'ordinateur';
}

export function GuideInstallation({ adresse }: { adresse: string }) {
  const [situation, setSituation] = useState<Situation>('chargement');

  // La détection a besoin de `window` : elle attend le premier rendu client.
  useEffect(() => setSituation(detecter()), []);

  if (situation === 'chargement') {
    return <Card className="text-muted-foreground rounded-3xl p-6 text-sm">Détection…</Card>;
  }

  if (situation === 'deja-installee') {
    return (
      <Card className="bg-primary/10 border-primary/40 rounded-3xl p-6">
        <p className="text-primary flex items-center gap-2 text-lg font-black">
          <Check className="size-6" strokeWidth={3} />
          C&apos;est déjà fait sur cet appareil.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          L&apos;application tourne depuis l&apos;écran d&apos;accueil : pas de barre
          d&apos;adresse, et les notifications de rappel sont possibles.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {situation === 'ios-autre-navigateur' ? (
        <Card className="rounded-3xl border-amber-500/50 bg-amber-500/[0.08] p-5">
          <p className="flex items-center gap-2 font-black text-amber-800">
            <TriangleAlert className="size-5" />
            Vous n&apos;êtes pas dans Safari
          </p>
          <p className="mt-2 text-sm text-amber-900/90">
            Sur iPhone, seul <strong>Safari</strong> sait ajouter une application à l&apos;écran
            d&apos;accueil. Les navigateurs intégrés — celui qui s&apos;ouvre depuis un SMS, un
            mail, WhatsApp ou Instagram — ne proposent pas l&apos;option, et c&apos;est presque
            toujours la raison pour laquelle on ne la trouve pas.
          </p>
          <p className="mt-3 text-sm font-bold text-amber-900">
            Ouvrez cette adresse dans Safari, puis revenez ici :
          </p>
          <p className="mt-1 rounded-xl bg-white/60 px-3 py-2 font-mono text-sm break-all">
            {adresse}
          </p>
        </Card>
      ) : null}

      {situation === 'ios-safari' || situation === 'ios-autre-navigateur' ? (
        <Etapes
          titre="Sur iPhone (Safari)"
          etapes={[
            {
              icone: <Share className="size-5" />,
              texte: (
                <>
                  Touchez le bouton <strong>Partager</strong> — le carré avec une flèche vers le
                  haut, en bas au centre de Safari.
                </>
              ),
            },
            {
              icone: <SquarePlus className="size-5" />,
              texte: (
                <>
                  Faites défiler la liste et touchez{' '}
                  <strong>« Sur l&apos;écran d&apos;accueil »</strong>. Si vous ne la voyez pas,
                  descendez jusqu&apos;à <strong>« Modifier les actions… »</strong> : elle a pu
                  être décochée.
                </>
              ),
            },
            {
              icone: <Check className="size-5" />,
              texte: (
                <>
                  Touchez <strong>Ajouter</strong>. L&apos;icône verte apparaît sur
                  l&apos;écran d&apos;accueil, sous le nom <strong>Lafayette</strong>.
                </>
              ),
            },
          ]}
        />
      ) : null}

      {situation === 'android' ? (
        <Etapes
          titre="Sur Android (Chrome)"
          etapes={[
            {
              icone: <Share className="size-5" />,
              texte: (
                <>
                  Touchez les <strong>trois points</strong> en haut à droite de Chrome.
                </>
              ),
            },
            {
              icone: <SquarePlus className="size-5" />,
              texte: (
                <>
                  Choisissez <strong>« Installer l&apos;application »</strong> ou{' '}
                  <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>.
                </>
              ),
            },
            {
              icone: <Check className="size-5" />,
              texte: <>Confirmez : l&apos;icône rejoint vos autres applications.</>,
            },
          ]}
        />
      ) : null}

      {situation === 'ordinateur' ? (
        <Card className="rounded-3xl p-6">
          <p className="font-black">Vous êtes sur un ordinateur</p>
          <p className="text-muted-foreground mt-2 text-sm">
            L&apos;installation se fait sur les téléphones : c&apos;est là que le comptage a lieu.
            Ouvrez cette adresse sur l&apos;iPhone concerné, dans Safari.
          </p>
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 font-mono text-sm break-all">
            {adresse}
          </p>
        </Card>
      ) : null}

      <Card className="rounded-3xl p-6">
        <p className="font-black">Pourquoi l&apos;installer</p>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5 text-sm">
          <li>Plus de barre d&apos;adresse : tout l&apos;écran sert au comptage.</li>
          <li>
            Les <strong>notifications de rappel</strong> ne fonctionnent sur iPhone QUE depuis
            l&apos;écran d&apos;accueil. C&apos;est une règle d&apos;Apple, pas un choix.
          </li>
          <li>L&apos;application s&apos;ouvre en un appui, comme n&apos;importe quelle autre.</li>
          <li>La connexion reste enregistrée : pas de mot de passe à retaper chaque matin.</li>
        </ul>
      </Card>
    </div>
  );
}

function Etapes({
  titre,
  etapes,
}: {
  titre: string;
  etapes: { icone: React.ReactNode; texte: React.ReactNode }[];
}) {
  return (
    <Card className="rounded-3xl p-6">
      <h2 className="text-lg font-black">{titre}</h2>
      <ol className="mt-4 space-y-4">
        {etapes.map((etape, index) => (
          <li key={index} className="flex gap-3.5">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
              {etape.icone}
            </span>
            <span className="flex-1 pt-1.5 text-sm leading-relaxed">
              <strong className="text-muted-foreground mr-1.5">{index + 1}.</strong>
              {etape.texte}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
