import { requireManager } from '@/lib/auth';
import {
  Activity,
  BarChart3,
  Check,
  Euro,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Salad,
  Smartphone,
  TriangleAlert,
  Users,
} from 'lucide-react';
import {
  getDailyCountStatus,
  getCountHours,
  getProducts,
} from '@/lib/admin/queries';
import { createClient } from '@/lib/supabase/server';
import { formatDateLong, todayInParis } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { GroupeMenu, RangeeMenu } from '@/components/rangee-menu';
import { HorairesComptage } from '@/components/admin/horaires-comptage';
import { ControleAcces } from '@/components/admin/controle-acces';
import { SignOutButton } from '@/components/pwa/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireManager();
  const today = todayInParis();
  const supabase = await createClient();

  const [statuses, products, heures, { data: droitsBruts }, { count: equipe }] = await Promise.all([
    getDailyCountStatus(today),
    getProducts(false),
    getCountHours(),
    supabase.from('role_permissions').select('permission, role, allowed'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const { count: categories } = await supabase
    .from('product_categories')
    .select('id', { count: 'exact', head: true });

  // Deux chiffres qui méritent qu'on aille voir : une base à zéro laisse la
  // cible à zéro, et un produit sans photo se reconnaît moins vite.
  const sansBase = products.filter((product) => Number(product.base_qty) <= 0).length;
  const sansPhoto = products.filter((product) => !product.image_url).length;
  const tousEnPrioriteParDefaut = products.every((product) => product.priority === 3);

  // « permission:role » → autorisé. L'écran d'interrupteurs n'a besoin
  // que de ça, et la table est minuscule.
  const droits = Object.fromEntries(
    (droitsBruts ?? []).map((ligne) => [`${ligne.permission}:${ligne.role}`, ligne.allowed]),
  );

  const faits = statuses.filter((status) => status.status === 'submitted').length;
  const relancesEnAttente = statuses.reduce((sum, status) => sum + status.pendingTasks, 0);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Bonjour {user.fullName.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-1 text-sm font-semibold capitalize">
            {formatDateLong(today)}
          </p>
        </div>

        <span
          className={
            faits === 2
              ? 'bg-primary text-primary-foreground flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-black'
              : 'bg-alert text-alert-foreground flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-black'
          }
        >
          {faits === 2 ? (
            <>
              <Check className="size-4" strokeWidth={3} /> Journée comptée
            </>
          ) : (
            `${faits}/2 comptages`
          )}
        </span>
      </header>

      {relancesEnAttente > 0 ? (
        <p className="bg-alert text-alert-foreground rounded-2xl px-4 py-3 text-sm font-black">
          {relancesEnAttente} relance{relancesEnAttente > 1 ? 's' : ''} encore à produire
          aujourd&apos;hui.
        </p>
      ) : null}

      {heures ? (
        <HorairesComptage morning={heures.morning} afternoon={heures.afternoon} />
      ) : null}


      <GroupeMenu titre="La carte">
        <RangeeMenu
          href="/admin/produits"
          icone={<Salad className="size-5" strokeWidth={2.2} />}
          titre="Produits"
          detail="Bases, seuils, priorités"
          badge={{
            texte: `${products.length}`,
            ton: sansBase > 0 || tousEnPrioriteParDefaut ? 'alerte' : 'neutre',
          }}
        />
        <RangeeMenu
          href="/admin/categories"
          icone={<LayoutGrid className="size-5" strokeWidth={2.2} />}
          titre="Catégories"
          detail="L'ordre des rayons"
          badge={{ texte: `${categories ?? 0}`, ton: 'neutre' }}
        />
        <RangeeMenu
          href="/admin/photos"
          icone={<ImageIcon className="size-5" strokeWidth={2.2} />}
          titre="Photos"
          detail="Reconnaître un produit d'un coup d'œil"
          badge={
            sansPhoto > 0
              ? { texte: `${sansPhoto} sans`, ton: 'alerte' }
              : { texte: 'complet', ton: 'fait' }
          }
        />
      </GroupeMenu>

      <GroupeMenu titre="Piloter">
        <RangeeMenu
          href="/admin/chiffre-affaires"
          icone={<Euro className="size-5" strokeWidth={2.2} />}
          titre="Chiffre d'affaires"
          detail="Prévisions, croissance, réalisé"
        />
        <RangeeMenu
          href="/admin/ruptures"
          icone={<TriangleAlert className="size-5" strokeWidth={2.2} />}
          titre="Ruptures"
          detail="Ce qui manque trop souvent"
        />
        <RangeeMenu
          href="/admin/historique"
          icone={<History className="size-5" strokeWidth={2.2} />}
          titre="Historique"
          detail="Qui a compté quoi"
        />
        <RangeeMenu
          href="/admin/simulateur"
          icone={<BarChart3 className="size-5" strokeWidth={2.2} />}
          titre="Simulateur"
          detail="Essayer un CA et voir les cibles"
        />
      </GroupeMenu>

      <GroupeMenu titre="L'équipe">
        <RangeeMenu
          href="/admin/utilisateurs"
          icone={<Users className="size-5" strokeWidth={2.2} />}
          titre="Équipe"
          detail="Comptes et statuts"
          badge={{ texte: `${equipe ?? 0}`, ton: 'neutre' }}
        />
        <RangeeMenu
          href="/installer"
          icone={<Smartphone className="size-5" strokeWidth={2.2} />}
          titre="Installer l'application"
          detail="Sur l'écran d'accueil des téléphones"
        />
      </GroupeMenu>

      <ControleAcces initial={droits} />

      {/* Réservé au propriétaire : l'entrée n'apparaît même pas pour le
          directeur, et les fonctions appelées le refuseraient de toute
          façon. */}
      {user.role === 'owner' ? (
        <GroupeMenu titre="Propriétaire">
          <RangeeMenu
            href="/admin/suivi"
            icone={<Activity className="size-5" strokeWidth={2.2} />}
            titre="Suivi de connexion"
            detail="Qui se connecte, et ce qui a été fait"
          />
        </GroupeMenu>
      ) : null}

      {sansBase > 0 || tousEnPrioriteParDefaut ? (
        <Card className="rounded-3xl p-5">
          <h2 className="font-black">À finir de régler</h2>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
            {sansBase > 0 ? (
              <li>
                {sansBase} produit{sansBase > 1 ? 's' : ''} sans base « VENTE POUR » : leur cible
                reste à zéro, ils ne seront jamais relancés.
              </li>
            ) : null}
            {tousEnPrioriteParDefaut ? (
              <li>
                Tous les produits sont en priorité 3. Régler les priorités change l&apos;ordre du
                rapport de production — c&apos;est dix minutes bien placées.
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      {/* Se déconnecter depuis Gestion, comme depuis « Mon compte ».
          Sur un téléphone partagé entre plusieurs postes, c'est le geste
          qu'on cherche en partant — il ne doit pas obliger à passer par
          l'avatar en haut de l'écran. */}
      <div className="pt-2">
        <SignOutButton variant="outline" />
      </div>
    </div>
  );
}
