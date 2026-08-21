'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Copy, KeyRound, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import {
  createTeamMember,
  creerCodeActivation,
  resetMemberPassword,
  setMemberActive,
  setMemberRole,
  supprimerCompte,
  type UserFormState,
} from '@/app/admin/utilisateurs/actions';
import type { UserRole } from '@/lib/supabase/database.types';

export interface TeamMember {
  id: string;
  fullName: string;
  /** Nulle si le compte a été créé sans adresse : le lien d'activation
      n'a alors nulle part où aller, et le bouton reste inerte. */
  email: string | null;
  role: UserRole;
  isActive: boolean;
  isMe: boolean;
  /** Jamais connecté = le compte attend encore son mot de passe. */
  lastSignInAt: string | null;
}

const ROLES: UserRole[] = ['employee', 'assistant_manager', 'manager', 'owner'];

/** Pastille de statut : le coup d'œil doit suffire. */
const ROLE_STYLE: Record<UserRole, string> = {
  owner: 'bg-primary/15 text-primary',
  manager: 'bg-primary/15 text-primary',
  assistant_manager: 'bg-alert text-alert-foreground',
  employee: 'bg-muted text-muted-foreground',
};

export function TeamManager({ members }: { members: TeamMember[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      {creating ? (
        <CreateMemberForm onDone={() => setCreating(false)} />
      ) : (
        <Button onClick={() => setCreating(true)} className="h-12 rounded-2xl font-bold">
          <UserPlus className="size-4" />
          Ajouter quelqu&apos;un
        </Button>
      )}

      <div className="space-y-2.5">
        {members.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}

function CreateMemberForm({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState<UserFormState, FormData>(createTeamMember, {});
  const [role, setRole] = useState<UserRole>('employee');

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(onDone, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.success, onDone]);

  return (
    <Card className="rounded-3xl p-6">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="role" value={role} />

        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-black">Nouveau compte</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="font-semibold">
              Prénom
            </Label>
            <Input id="fullName" name="fullName" required className="h-12 rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="font-semibold">
              Adresse e-mail
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              required
              className="h-12 rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="font-semibold">
            Mot de passe initial
          </Label>
          <Input
            id="password"
            name="password"
            type="text"
            minLength={8}
            required
            defaultValue={suggestPassword()}
            className="h-12 rounded-xl font-mono"
          />
          <p className="text-muted-foreground text-xs">
            Communiquez-le de vive voix. La personne pourra le changer depuis son compte.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Statut</legend>
          <div className="grid gap-2">
            {ROLES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setRole(candidate)}
                aria-pressed={role === candidate}
                className={cn(
                  'rounded-2xl border p-3.5 text-left transition-colors',
                  role === candidate
                    ? 'border-foreground bg-muted/60'
                    : 'hover:bg-muted/30 border-border',
                )}
              >
                <span className="flex items-center gap-2 font-bold">
                  {ROLE_LABELS[candidate]}
                  {role === candidate ? <Check className="text-primary size-4" /> : null}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {ROLE_DESCRIPTIONS[candidate]}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {state.error ? (
          <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="bg-primary/10 text-primary rounded-xl px-4 py-3 text-sm font-medium">
            {state.success}
          </p>
        ) : null}

        <CreateButton />
      </form>
    </Card>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-12 w-full rounded-2xl font-bold">
      {pending ? 'Création…' : 'Créer le compte'}
    </Button>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  const [pending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [confirmeSuppression, setConfirmeSuppression] = useState(false);

  return (
    <Card className={cn('rounded-2xl p-4', !member.isActive && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold">
            {member.fullName}
            {member.isMe ? (
              <span className="text-muted-foreground text-xs font-medium">(vous)</span>
            ) : null}
          </p>
          <span
            className={cn(
              'mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold',
              ROLE_STYLE[member.role],
            )}
          >
            {ROLE_LABELS[member.role]}
          </span>
          {!member.isActive ? (
            <span className="text-muted-foreground ml-2 text-xs">· désactivé</span>
          ) : member.lastSignInAt === null ? (
            <span className="text-muted-foreground ml-2 text-xs">· jamais connecté</span>
          ) : null}
          {member.email ? (
            <p className="text-muted-foreground mt-1 truncate text-xs">{member.email}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={member.role}
            disabled={pending}
            aria-label={`Statut de ${member.fullName}`}
            onChange={(event) =>
              startTransition(async () => {
                const result = await setMemberRole(member.id, event.target.value as UserRole);
                setMessage(result.error ?? null);
              })
            }
            className="border-input bg-background h-10 rounded-xl border px-2 text-sm font-medium"
          >
            {ROLES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {ROLE_LABELS[candidate]}
              </option>
            ))}
          </select>

          {/* Un code, pas un lien.

              Les liens de Supabase passent par son point de vérification,
              qui consomme le jeton puis redirige vers une adresse que nous
              ne maîtrisons pas — et les antivirus des messageries les
              ouvrent avant leur destinataire. D'où le « lien expiré » à
              chaque essai. Un code ne s'ouvre pas tout seul. */}
          <Button
            size="sm"
            className="h-10 rounded-xl font-bold"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setCode(null);
                const resultat = await creerCodeActivation(member.id);
                if (resultat.error || !resultat.code) {
                  setMessage(resultat.error ?? 'Code impossible à créer.');
                  return;
                }
                setCode(resultat.code);
                setMessage(null);
                try {
                  await navigator.clipboard.writeText(resultat.code);
                } catch {
                  // Safari refuse le presse-papiers hors interaction
                  // directe : le code reste affiché juste en dessous.
                }
              })
            }
          >
            Code d&apos;accès
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl"
            onClick={() => setResetting((current) => !current)}
            title="Définir un mot de passe à la main"
          >
            <KeyRound className="size-4" />
          </Button>

          {/* Désactiver suffit dans la plupart des cas ; supprimer efface
              l'adresse et libère le compte. Les deux gestes cohabitent,
              le second derrière une confirmation. */}
          {!member.isMe ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-10 rounded-xl"
              disabled={pending}
              title="Supprimer définitivement ce compte"
              onClick={() => setConfirmeSuppression((actuel) => !actuel)}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}

          <Switch
            checked={member.isActive}
            disabled={pending || member.isMe}
            aria-label={member.isActive ? 'Désactiver le compte' : 'Activer le compte'}
            onCheckedChange={(checked) =>
              startTransition(async () => {
                const result = await setMemberActive(member.id, checked);
                setMessage(result.error ?? null);
              })
            }
          />
        </div>
      </div>

      {resetting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <Input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Nouveau mot de passe (8 caractères min.)"
            className="h-10 max-w-xs rounded-xl font-mono"
          />
          <Button
            size="sm"
            className="h-10 rounded-xl"
            disabled={pending || newPassword.length < 8}
            onClick={() =>
              startTransition(async () => {
                const result = await resetMemberPassword(member.id, newPassword);
                setMessage(result.error ?? result.success ?? null);
                if (result.success) {
                  setNewPassword('');
                  setResetting(false);
                }
              })
            }
          >
            Appliquer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10"
            onClick={() => setNewPassword(suggestPassword())}
          >
            Proposer
          </Button>
        </div>
      ) : null}

      {code ? (
        <div className="bg-primary/10 border-primary/25 mt-3 space-y-2 rounded-2xl border p-3.5">
          <p className="text-primary text-xs font-black tracking-wide uppercase">
            Code pour {member.fullName}
          </p>
          <p className="bg-background rounded-xl border px-3 py-2.5 text-center font-mono text-2xl font-black tracking-widest">
            {code}
          </p>
          <p className="text-muted-foreground text-[11px] leading-relaxed font-semibold">
            Valable 24 h, une seule fois. Dictez-le ou envoyez-le par SMS. La personne va sur le
            site, touche « Première connexion » et saisit son adresse e-mail avec ce code.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={() => void navigator.clipboard?.writeText(code).catch(() => {})}
            >
              <Copy className="size-3.5" />
              Copier
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setCode(null)}>
              Masquer
            </Button>
          </div>
        </div>
      ) : null}

      {confirmeSuppression ? (
        <div className="border-destructive/30 bg-destructive/[0.06] mt-3 space-y-2.5 rounded-2xl border p-3.5">
          <p className="text-destructive text-[13px] leading-relaxed font-bold">
            Supprimer définitivement le compte de {member.fullName} ? Ses comptages passés
            restent dans l&apos;historique.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-9 rounded-xl font-bold"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const resultat = await supprimerCompte(member.id);
                  setMessage(resultat.error ?? resultat.success ?? null);
                  if (!resultat.error) setConfirmeSuppression(false);
                })
              }
            >
              Oui, supprimer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => setConfirmeSuppression(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {message ? <p className="text-muted-foreground mt-2 text-xs">{message}</p> : null}
    </Card>
  );
}

/**
 * Un mot de passe lisible à voix haute, sans caractère ambigu.
 *
 * Tiré du générateur cryptographique du navigateur, pas de `Math.random`
 * dont la suite se prédit à partir de quelques tirages. Ce mot de passe
 * ouvre un compte : il n'a pas à être devinable.
 *
 * Le modulo introduirait un biais si l'alphabet ne divisait pas 256 ; il
 * en compte 32, donc le tirage reste uniforme.
 */
function suggestPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const octets = crypto.getRandomValues(new Uint8Array(10));
  const random = Array.from(octets, (octet) => alphabet[octet % alphabet.length]).join('');
  return `Lafayette-${random}`;
}
