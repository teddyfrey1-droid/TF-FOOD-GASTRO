'use client';

import { useState, useTransition } from 'react';
import {
  ChevronDown,
  ClipboardCheck,
  Eye,
  Loader2,
  LogIn,
  MousePointerClick,
  Settings2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ROLE_LABELS } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { chargerFrise, type LigneFrise } from '@/app/admin/suivi/detail';
import type { UserRole } from '@/lib/supabase/database.types';

export interface LignePersonne {
  userId: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  derniereConnexion: string | null;
  derniereActivite: string | null;
  vues7j: number;
  actions7j: number;
  comptages30j: number;
  modifications30j: number;
}

const QUAND = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** « il y a 3 h » se lit plus vite qu'une date complète. */
function depuis(iso: string | null): string {
  if (!iso) return 'jamais';

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 60 * 24) return `il y a ${Math.round(minutes / 60)} h`;

  const jours = Math.round(minutes / (60 * 24));
  return jours === 1 ? 'hier' : `il y a ${jours} jours`;
}

const ICONES: Record<string, typeof Eye> = {
  vue: Eye,
  action: MousePointerClick,
  connexion: LogIn,
  comptage: ClipboardCheck,
  modification: Settings2,
};

/**
 * Une personne, dépliable sur sa frise d'activité.
 *
 * Replié, on voit l'essentiel : dernière connexion, dernière activité,
 * et quatre compteurs. Déplié, la frise réunit trois sources — écrans
 * ouverts, comptages validés, réglages modifiés — dans l'ordre du
 * temps. Lues séparément elles ne racontent rien ; entrelacées, elles
 * montrent une journée de travail.
 */
export function SuiviPersonne({ personne }: { personne: LignePersonne }) {
  const [ouvert, setOuvert] = useState(false);
  const [frise, setFrise] = useState<LigneFrise[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, demarrer] = useTransition();

  function basculer() {
    const prochain = !ouvert;
    setOuvert(prochain);
    if (prochain && frise === null) {
      demarrer(async () => {
        const resultat = await chargerFrise(personne.userId);
        if (resultat.error) setErreur(resultat.error);
        setFrise(resultat.lignes);
      });
    }
  }

  const jamaisVenu = personne.derniereConnexion === null;

  return (
    <Card className={cn('overflow-hidden rounded-2xl p-0', !personne.isActive && 'opacity-60')}>
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <span
          aria-hidden
          className="bg-primary/12 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black"
        >
          {personne.fullName.trim().charAt(0).toUpperCase()}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] leading-tight font-black">
              {personne.fullName}
            </span>
            <span className="text-muted-foreground shrink-0 text-[11px] font-bold">
              {ROLE_LABELS[personne.role]}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[12px] font-semibold',
              jamaisVenu ? 'text-alert-foreground' : 'text-muted-foreground',
            )}
          >
            {jamaisVenu
              ? 'Ne s’est jamais connecté'
              : `Connexion ${depuis(personne.derniereConnexion)} · activité ${depuis(
                  personne.derniereActivite,
                )}`}
          </span>
        </span>

        <ChevronDown
          className={cn(
            'text-muted-foreground/60 size-4 shrink-0 transition-transform',
            ouvert && 'rotate-180',
          )}
          strokeWidth={2.5}
        />
      </button>

      <div className="grid grid-cols-4 gap-px border-t bg-border/60">
        <Compteur valeur={personne.vues7j} libelle="écrans / 7 j" />
        <Compteur valeur={personne.actions7j} libelle="gestes / 7 j" />
        <Compteur valeur={personne.comptages30j} libelle="comptages / 30 j" />
        <Compteur valeur={personne.modifications30j} libelle="réglages / 30 j" />
      </div>

      {ouvert ? (
        <div className="border-t px-4 py-3">
          {chargement ? (
            <p className="text-muted-foreground flex items-center gap-2 py-4 text-[13px] font-semibold">
              <Loader2 className="size-4 animate-spin" />
              Chargement…
            </p>
          ) : erreur ? (
            <p className="text-destructive text-[13px] font-semibold">{erreur}</p>
          ) : frise && frise.length > 0 ? (
            <ol className="space-y-2">
              {frise.map((ligne, index) => {
                const Icone = ICONES[ligne.categorie] ?? Eye;
                return (
                  <li key={`${ligne.survenuLe}-${index}`} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg',
                        ligne.categorie === 'comptage'
                          ? 'bg-primary/12 text-primary'
                          : ligne.categorie === 'modification'
                            ? 'bg-alert text-alert-foreground'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Icone className="size-3.5" strokeWidth={2.4} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] leading-tight font-bold">
                        {ligne.libelle}
                      </span>
                      <span className="text-muted-foreground block text-[11px] font-semibold">
                        {QUAND.format(new Date(ligne.survenuLe))}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground py-3 text-[13px] font-semibold">
              Aucune activité sur les trente derniers jours.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function Compteur({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div className="bg-card px-2 py-2 text-center">
      <p
        className={cn(
          'text-[17px] leading-none font-black tabular-nums',
          valeur === 0 && 'text-muted-foreground/40',
        )}
      >
        {valeur}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[10px] leading-tight font-bold">{libelle}</p>
    </div>
  );
}
