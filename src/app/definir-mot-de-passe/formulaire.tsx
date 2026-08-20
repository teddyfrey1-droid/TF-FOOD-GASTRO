'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type Etat = 'verification' | 'pret' | 'lien-invalide' | 'enregistre';

/**
 * Choix du mot de passe, au bout du lien d'activation.
 *
 * Deux formes de lien arrivent ici, et il faut les deux :
 *
 * 1. `?token_hash=…&type=recovery` — le lien fabriqué par l'écran Équipe.
 *    Le jeton est échangé ici même contre une session (`verifyOtp`). Ce
 *    chemin ne dépend d'aucun réglage du tableau de bord Supabase, et
 *    n'use aucun quota d'envoi : c'est le chemin sûr.
 *
 * 2. `#access_token=…` — le lien reçu par courriel. Supabase pose alors le
 *    jeton dans le FRAGMENT, que le navigateur ne transmet jamais au
 *    serveur : c'est le client Supabase qui le ramasse, de façon
 *    asynchrone. D'où l'écoute ci-dessous en plus du premier examen.
 *
 * Dans les deux cas on attend la session avant d'afficher le formulaire —
 * sinon on proposerait un champ dont l'envoi échouerait.
 */
export function DefinirMotDePasse() {
  const router = useRouter();
  const parametres = useSearchParams();
  const jeton = parametres.get('token_hash');
  const [etat, setEtat] = useState<Etat>('verification');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let vivant = true;

    async function ouvrirLaSession() {
      // Forme 1 : le jeton est dans l'adresse, on l'échange nous-mêmes.
      if (jeton) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: jeton,
          type: 'recovery',
        });
        if (!vivant) return;
        setEtat(error ? 'lien-invalide' : 'pret');

        // Le jeton ne sert qu'une fois : on l'efface de la barre
        // d'adresse pour qu'un rafraîchissement ne rejoue pas un échange
        // déjà consommé — et qu'il ne traîne pas dans l'historique.
        window.history.replaceState(null, '', '/definir-mot-de-passe');
        return;
      }

      // Forme 2 : le client a peut-être déjà lu le fragment. `getSession`
      // ne cherche pas à faire confiance au jeton, seulement à savoir si
      // le lien en a déposé un ; toute écriture repasse par le serveur.
      const { data } = await supabase.auth.getSession();
      if (!vivant) return;
      setEtat(data.session ? 'pret' : 'lien-invalide');
    }

    void ouvrirLaSession();

    // Le fragment est traité de façon asynchrone : cet écouteur rattrape
    // le cas où la session arrive après le premier examen.
    const { data: ecoute } = supabase.auth.onAuthStateChange((_evenement, session) => {
      if (session) setEtat((actuel) => (actuel === 'enregistre' ? actuel : 'pret'));
    });

    return () => {
      vivant = false;
      ecoute.subscription.unsubscribe();
    };
  }, [jeton]);

  async function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur(null);

    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    setEnvoi(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnvoi(false);

    if (error) {
      setErreur(`Enregistrement impossible : ${error.message}`);
      return;
    }

    setEtat('enregistre');
    router.replace('/');
    router.refresh();
  }

  if (etat === 'verification') {
    return (
      <p className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Vérification du lien…
      </p>
    );
  }

  if (etat === 'lien-invalide') {
    return (
      <div className="space-y-4 text-center">
        <p className="font-bold">Ce lien n&apos;est plus valable.</p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Les liens d&apos;activation expirent au bout d&apos;une heure, et ne servent
          qu&apos;une fois. Demandez à votre directeur de vous en renvoyer un.
        </p>
        <Link href="/connexion" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="motDePasse" className="text-sm font-semibold">
          Nouveau mot de passe
        </Label>
        <div className="relative">
          <Input
            id="motDePasse"
            type={visible ? 'text' : 'password'}
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
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

      {erreur ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          {erreur}
        </p>
      ) : null}

      <Button type="submit" disabled={envoi} className="h-13 w-full rounded-2xl text-base font-bold">
        {envoi ? <Loader2 className="size-5 animate-spin" /> : 'Enregistrer et entrer'}
      </Button>
    </form>
  );
}
