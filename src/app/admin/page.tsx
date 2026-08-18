import Link from 'next/link';
import { getDailyCountStatus, getForecastRevenue, getProducts } from '@/lib/admin/queries';
import { formatDateLong, formatEuro, todayInParis } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default async function DashboardPage() {
  const today = todayInParis();
  const [forecast, statuses, products] = await Promise.all([
    getForecastRevenue(today),
    getDailyCountStatus(today),
    getProducts(false),
  ]);

  const placeholders = products.filter((product) => product.gn_format?.includes('à confirmer'));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1 text-sm capitalize">{formatDateLong(today)}</p>
      </header>

      {placeholders.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="font-semibold">Données encore provisoires</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {placeholders.length} produit{placeholders.length > 1 ? 's' : ''} sur {products.length}{' '}
            porte{placeholders.length > 1 ? 'nt' : ''} encore un format GN « à confirmer », ainsi
            que des seuils et des paliers de calculateur provisoires. Ils ne doivent pas servir en
            production.
          </p>
          <Link
            href="/admin/produits"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-4' })}
          >
            Compléter les produits
          </Link>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-muted-foreground text-sm">CA prévisionnel du jour</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatEuro(forecast)}</p>
          {forecast === null ? (
            <p className="text-muted-foreground mt-2 text-xs">
              Aucun CA de référence pour l&apos;an dernier à cette date.
            </p>
          ) : null}
        </Card>

        {statuses.map((status) => (
          <Card key={status.session} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted-foreground text-sm">
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

            <p className="mt-2 text-sm">
              {status.status === 'submitted' && status.submittedAt
                ? `${TIME.format(new Date(status.submittedAt))} par ${status.userName ?? '—'}`
                : status.status === 'draft'
                  ? `Commencé par ${status.userName ?? '—'}`
                  : 'Pas encore commencé'}
            </p>

            {status.status === 'submitted' ? (
              <p className="text-muted-foreground mt-3 text-sm tabular-nums">
                Relances : {status.doneTasks} faite{status.doneTasks > 1 ? 's' : ''} ·{' '}
                {status.pendingTasks} en attente
              </p>
            ) : null}
          </Card>
        ))}
      </section>

      <Card className="p-6">
        <h2 className="font-semibold">À venir</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          L&apos;analyse de consommation du midi, la comparaison prévu / réalisé et la détection
          d&apos;anomalies arrivent en phase 3.
        </p>
      </Card>
    </div>
  );
}
