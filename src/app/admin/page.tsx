import { requireManager } from '@/lib/auth';
import { CalendarCheck2, Check } from 'lucide-react';
import {
  getDailyCountStatus,
  getForecastRevenue,
  getGrowthWindows,
  getProducts,
  getReferenceRevenue,
  getRevenueCoverage,
  getRevenueSettings,
} from '@/lib/admin/queries';
import { createClient } from '@/lib/supabase/server';
import { formatDateLong, formatEuro, todayInParis } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { GrowthCard } from '@/components/admin/growth-card';
import { SectionGestion, TuileGestion } from '@/components/admin/tuile-gestion';
import { referenceDateLastYear } from '@/lib/mep';

export const dynamic = 'force-dynamic';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default async function DashboardPage() {
  const user = await requireManager();
  const today = todayInParis();
  const supabase = await createClient();

  const [forecast, reference, statuses, products, settings, windows, coverage, { count: equipe }] =
    await Promise.all([
      getForecastRevenue(today),
      getReferenceRevenue(today, 'morning'),
      getDailyCountStatus(today),
      getProducts(false),
      getRevenueSettings(),
      getGrowthWindows(today),
      getRevenueCoverage(),
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

      {/* ------------------------------------------------------------------
          Le CA prévisionnel décide de toute la production du jour : il se
          lit d'un coup d'œil, avec sa provenance juste en dessous.
         ------------------------------------------------------------------ */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="bg-primary text-primary-foreground rounded-3xl p-6">
          <p className="text-xs font-bold tracking-wide uppercase opacity-80">
            CA prévisionnel du jour
          </p>
          <p className="mt-2 text-6xl font-black tracking-tight tabular-nums">
            {formatEuro(forecast)}
          </p>

          {forecast === null ? (
            <p className="mt-3 text-sm opacity-90">
              Aucun CA de référence pour l&apos;an dernier à cette date : la production ne peut
              pas être calculée aujourd&apos;hui.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-relaxed opacity-90">
              {formatEuro(reference)} le{' '}
              {formatDateLong(referenceDateLastYear(today)).replace(/ \d{4}$/, '')} de
              l&apos;an dernier, majoré du taux de croissance.
            </p>
          )}

          <div className="mt-5 flex items-center gap-2 border-t border-current/20 pt-4 text-xs font-medium opacity-90">
            <CalendarCheck2 className="size-4" />
            {coverage.days > 0 ? (
              <span>
                {coverage.days.toLocaleString('fr-FR')} journées de CA en base, jusqu&apos;au{' '}
                {formatDateLong(coverage.lastDate!).replace(/^\w+ /, '')}
              </span>
            ) : (
              <span>Aucun chiffre d&apos;affaires chargé.</span>
            )}
          </div>
        </Card>

        <GrowthCard
          currentRate={settings.growthRate}
          windows={windows.map((window) => ({
            label: window.label,
            days: window.days,
            rate: window.observation.observedRate,
          }))}
          totals={
            windows[0].observation.sampleDays > 0
              ? {
                  actual: windows[0].observation.totalActual,
                  reference: windows[0].observation.totalReference,
                }
              : null
          }
        />
      </section>

      <section className="grid gap-2.5 sm:grid-cols-2">
        {statuses.map((status) => (
          <Card key={status.session} className="rounded-3xl p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
              >
                {status.session === 'morning' ? '🌅' : '🌆'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-black">
                  Comptage {status.session === 'morning' ? 'du matin' : "de l'après-midi"}
                </p>
                <p className="text-muted-foreground text-xs font-semibold">
                  {status.status === 'submitted' && status.submittedAt
                    ? `${TIME.format(new Date(status.submittedAt))} par ${status.userName ?? '—'}`
                    : status.status === 'draft'
                      ? `Commencé par ${status.userName ?? '—'}`
                      : 'Pas encore commencé'}
                </p>
              </div>
              {status.status === 'submitted' ? (
                <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Check className="size-4" strokeWidth={3} />
                </span>
              ) : null}
            </div>

            {status.status === 'submitted' && status.pendingTasks + status.doneTasks > 0 ? (
              <p className="mt-3 text-sm font-bold tabular-nums">
                {status.doneTasks} relance{status.doneTasks > 1 ? 's' : ''} faite
                {status.doneTasks > 1 ? 's' : ''} · {status.pendingTasks} en attente
              </p>
            ) : null}
          </Card>
        ))}
      </section>

      {relancesEnAttente > 0 ? (
        <p className="bg-alert text-alert-foreground rounded-2xl px-4 py-3 text-sm font-black">
          {relancesEnAttente} relance{relancesEnAttente > 1 ? 's' : ''} encore à produire
          aujourd&apos;hui.
        </p>
      ) : null}

      <SectionGestion titre="La carte">
        <TuileGestion
          href="/admin/produits"
          emoji="🥗"
          titre="Produits"
          description="Noms, bases, seuils, priorités, zones"
          badge={`${products.length}`}
          alerte={sansBase > 0 || tousEnPrioriteParDefaut}
        />
        <TuileGestion
          href="/admin/categories"
          emoji="🗂️"
          titre="Catégories"
          description="L'ordre des rayons pendant le comptage"
          badge={`${categories ?? 0}`}
        />
        <TuileGestion
          href="/admin/photos"
          emoji="📸"
          titre="Photos"
          description="Reconnaître un produit d'un coup d'œil"
          badge={sansPhoto > 0 ? `${sansPhoto} sans` : 'complet'}
          alerte={sansPhoto > 0}
        />
      </SectionGestion>

      <SectionGestion titre="Piloter">
        <TuileGestion
          href="/admin/chiffre-affaires"
          emoji="💶"
          titre="Chiffre d'affaires"
          description="Prévisions du mois, croissance, réalisé"
        />
        <TuileGestion
          href="/admin/ruptures"
          emoji="🚨"
          titre="Ruptures"
          description="Ce qui manque trop souvent, et pourquoi"
        />
        <TuileGestion
          href="/admin/historique"
          emoji="📋"
          titre="Historique"
          description="Qui a compté quoi, et ce qui a été consommé"
        />
        <TuileGestion
          href="/admin/simulateur"
          emoji="🎚️"
          titre="Simulateur"
          description="Essayer un CA et voir toutes les cibles"
        />
      </SectionGestion>

      <SectionGestion titre="L'équipe">
        <TuileGestion
          href="/admin/utilisateurs"
          emoji="👥"
          titre="Équipe"
          description="Comptes, statuts, mots de passe"
          badge={`${equipe ?? 0}`}
        />
        <TuileGestion
          href="/installer"
          emoji="📲"
          titre="Installer l'application"
          description="La mettre sur l'écran d'accueil des téléphones"
        />
        <TuileGestion
          href="/compte"
          emoji="🔑"
          titre="Mon compte"
          description="Changer mon mot de passe"
        />
      </SectionGestion>

      {sansBase > 0 || tousEnPrioriteParDefaut ? (
        <Card className="rounded-3xl border-amber-500/40 bg-amber-500/[0.06] p-5">
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
    </div>
  );
}
