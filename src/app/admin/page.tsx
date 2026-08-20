import { requireManager } from '@/lib/auth';
import Link from 'next/link';
import { ArrowRight, CalendarCheck2 } from 'lucide-react';
import {
  getDailyCountStatus,
  getForecastRevenue,
  getGrowthWindows,
  getProducts,
  getReferenceRevenue,
  getRevenueCoverage,
  getRevenueSettings,
} from '@/lib/admin/queries';
import { formatDateLong, formatEuro, todayInParis } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { GrowthCard } from '@/components/admin/growth-card';
import { referenceDateLastYear } from '@/lib/mep';

export const dynamic = 'force-dynamic';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default async function DashboardPage() {
  await requireManager();
  const today = todayInParis();

  const [forecast, reference, statuses, products, settings, windows, coverage] = await Promise.all([
    getForecastRevenue(today),
    getReferenceRevenue(today, 'morning'),
    getDailyCountStatus(today),
    getProducts(false),
    getRevenueSettings(),
    getGrowthWindows(today),
    getRevenueCoverage(),
  ]);

  // Un produit sans base n'a pas encore reçu sa valeur « VENTE POUR ».
  const placeholders = products.filter((product) => Number(product.base_qty) <= 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1 text-sm font-medium capitalize">
          {formatDateLong(today)}
        </p>
      </header>

      {/* ------------------------------------------------------------------
          Le CA prévisionnel, en grand.
          C'est lui qui décide de toute la production du jour : il doit se
          lire d'un coup d'œil, avec sa provenance juste en dessous.
         ------------------------------------------------------------------ */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
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

      {placeholders.length > 0 ? (
        <Card className="rounded-3xl border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="font-bold">Données encore provisoires</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {placeholders.length} produit{placeholders.length > 1 ? 's' : ''} sur {products.length}{' '}
            n&apos;{placeholders.length > 1 ? 'ont' : 'a'} pas encore de valeur « VENTE POUR » :
            leur cible restera à zéro tant qu&apos;elle n&apos;est pas saisie.
          </p>
          <Link
            href="/admin/produits"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-4' })}
          >
            Compléter les produits
          </Link>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        {statuses.map((status) => (
          <Card key={status.session} className="rounded-3xl p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">
                Comptage {status.session === 'morning' ? 'du matin' : "de l'après-midi"}
              </p>
              <Badge variant={status.status === 'submitted' ? 'secondary' : 'outline'}>
                {status.status === 'submitted'
                  ? 'Fait'
                  : status.status === 'draft'
                    ? 'En cours'
                    : 'À faire'}
              </Badge>
            </div>

            <p className="text-muted-foreground mt-2 text-sm">
              {status.status === 'submitted' && status.submittedAt
                ? `${TIME.format(new Date(status.submittedAt))} par ${status.userName ?? '—'}`
                : status.status === 'draft'
                  ? `Commencé par ${status.userName ?? '—'}`
                  : 'Pas encore commencé'}
            </p>

            {status.status === 'submitted' ? (
              <p className="mt-3 text-sm font-medium tabular-nums">
                Relances : {status.doneTasks} faite{status.doneTasks > 1 ? 's' : ''} ·{' '}
                {status.pendingTasks} en attente
              </p>
            ) : null}
          </Card>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { href: '/admin/produits', label: 'Produits', hint: `${products.length} actifs` },
          { href: '/admin/simulateur', label: 'Simulateur', hint: 'Cibles pour un CA donné' },
          { href: '/admin/utilisateurs', label: 'Équipe', hint: 'Accès et mots de passe' },
        ].map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="bg-muted/50 hover:bg-muted flex items-center justify-between gap-3 rounded-2xl px-5 py-4 transition-colors"
          >
            <span>
              <span className="block font-bold">{tile.label}</span>
              <span className="text-muted-foreground block text-xs font-medium">{tile.hint}</span>
            </span>
            <ArrowRight className="text-muted-foreground size-4" />
          </Link>
        ))}
      </section>
    </div>
  );
}
