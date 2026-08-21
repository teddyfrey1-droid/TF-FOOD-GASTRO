import { requireUser } from '@/lib/auth';
import { isManagerRole, isStaffLeadRole } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { todayInParis } from '@/lib/format';
import { BottomTabs } from '@/components/bottom-tabs';
import { AvatarCompte } from '@/components/avatar-compte';
import { ListeStocks, type LigneStock } from '@/components/stocks/liste-stocks';
import { LienRetour } from '@/components/lien-retour';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Stocks — Lafayette' };

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

export default async function StocksPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const aujourdhui = todayInParis();

  // Le comptage le plus récent de la journée fait foi : c'est le dernier
  // passage dans les frigos, donc l'image la plus fidèle de ce qui s'y
  // trouve. Un comptage en cours ne dit rien de fiable — on prend le
  // dernier VALIDÉ, et on l'annonce.
  const { data: sessions } = await supabase
    .from('count_sessions')
    .select('id, session, status, submitted_at, user_id')
    .eq('date', aujourdhui)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false });

  const derniere = sessions?.[0] ?? null;

  const { data: equipe } = await supabase.from('team_members').select('id, full_name');
  const auteur = derniere
    ? ((equipe ?? []).find((membre) => membre.id === derniere.user_id)?.full_name ?? null)
    : null;

  const { data: brut } = derniere
    ? await supabase.rpc('mep_etat_stock', { p_session_id: derniere.id })
    : { data: null };

  const lignes: LigneStock[] = (brut ?? []).map((ligne) => ({
    productId: ligne.product_id,
    productName: ligne.product_name,
    categoryName: ligne.category_name,
    qtySaladbar: Number(ligne.qty_saladbar),
    qtyFridge: Number(ligne.qty_fridge),
    qtyTotal: Number(ligne.qty_total),
    inSaladbar: ligne.in_saladbar,
    inFridge: ligne.in_fridge,
    etat: ligne.etat,
    surplus: Number(ligne.surplus),
  }));

  return (
    <>
      <main className="pt-safe-header mx-auto w-full max-w-md px-5 pt-4 pb-28">
        <LienRetour className="mb-2" />

        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-black tracking-tight">Dans les frigos</h1>
            <p className="text-muted-foreground mt-0.5 text-[13px] font-semibold">
              {derniere
                ? `D’après le comptage ${
                    derniere.session === 'morning' ? 'du matin' : 'de l’après-midi'
                  }${derniere.submitted_at ? `, ${HEURE.format(new Date(derniere.submitted_at))}` : ''}${
                    auteur ? ` · ${auteur}` : ''
                  }`
                : 'Aucun comptage validé aujourd’hui'}
            </p>
          </div>

          <AvatarCompte nom={user.fullName} />
        </header>

        {derniere ? (
          <ListeStocks lignes={lignes} />
        ) : (
          <p className="text-muted-foreground rounded-3xl border border-dashed p-8 text-center text-sm font-semibold">
            Les quantités s’affichent ici dès qu’un comptage est validé. En attendant, il n’y a
            rien de fiable à montrer.
          </p>
        )}
      </main>

      <BottomTabs isStaffLead={isStaffLeadRole(user.role)} isManager={isManagerRole(user.role)} />
    </>
  );
}
