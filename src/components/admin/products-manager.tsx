'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, CircleOff, IceCream, Salad, Snowflake, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  setCategoryZones,
  supprimerProduit,
  toggleProductActive,
  updateProductInline,
} from '@/app/admin/produits/actions';
import { ProductForm } from './product-form';
import { VignetteProduit } from '@/components/produits/vignette-produit';
import { QuickEdit } from './product-quick-edit';
import type { ProductWithCategory } from '@/lib/admin/queries';
import type { Tables } from '@/lib/supabase/database.types';

/**
 * ⚠️ 1 est LE PLUS urgent : l'échelle se lit comme un classement.
 * Les couleurs suivent — rouge en haut, gris en bas.
 */
const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-400',
  4: 'bg-blue-400',
  5: 'bg-neutral-300',
};

/**
 * Résume le seuil critique.
 *
 * Il ne remplace pas le minimum, il le double : sous le minimum on relance,
 * sous le critique on relance EN PREMIER, avant tout produit plus
 * prioritaire mais encore confortable.
 */
function describeCritical(product: ProductWithCategory): string {
  if (product.crit_mode === 'manual') {
    return product.crit_qty_manual === null
      ? '—'
      : `sous ${formatQty(Number(product.crit_qty_manual))}`;
  }
  const divisor = Number(product.crit_divisor) || 4;
  return divisor === 4 ? 'sous le quart de la cible' : `sous la cible / ${formatQty(divisor)}`;
}

/** Résume le minimum en une phrase lisible, sans jargon. */
function describeMinimum(product: ProductWithCategory): string {
  if (product.min_mode === 'manual') {
    return product.min_qty_manual === null
      ? '—'
      : `sous ${formatQty(Number(product.min_qty_manual))}`;
  }
  const divisor = Number(product.min_divisor) || 2;
  return divisor === 2 ? 'sous la moitié de la cible' : `sous la cible / ${formatQty(divisor)}`;
}

export function ProductsManager({
  products,
  categories,
}: {
  products: ProductWithCategory[];
  categories: Tables<'product_categories'>[];
}) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  // Un seul filtre de zone à la fois : on veut répondre à « qu'est-ce
  // qu'on compte en haut ? », pas composer une requête.
  const [filtreZone, setFiltreZone] = useState<'saladbar' | 'fridge' | 'desserts' | null>(
    null,
  );
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (!showInactive && !product.is_active) return false;
      if (filtreZone === 'saladbar' && !product.in_saladbar) return false;
      if (filtreZone === 'fridge' && !product.in_fridge) return false;
      if (filtreZone === 'desserts' && !product.in_desserts) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        (product.category?.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [products, search, showInactive, filtreZone]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, ProductWithCategory[]>();
    for (const product of visible) {
      const key = product.category?.name ?? 'Sans catégorie';
      byCategory.set(key, [...(byCategory.get(key) ?? []), product]);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [visible]);

  if (creating || editing) {
    return (
      <ProductForm
        product={editing}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  // Combien de produits chaque zone compte réellement. C'est la question
  // qu'on se pose devant les frigos, et elle n'avait pas de réponse.
  const actifs = products.filter((product) => product.is_active);
  const compteurs = {
    saladbar: actifs.filter((product) => product.in_saladbar).length,
    fridge: actifs.filter((product) => product.in_fridge).length,
    desserts: actifs.filter((product) => product.in_desserts).length,
  };

  return (
    <div className="space-y-5">
      {/* Le tableau de bord des zones : chaque tuile est aussi un filtre.
          Un produit rangé nulle part n'apparaît dans aucun comptage — il
          est invisible sans ce compteur, et c'est le genre d'oubli qui se
          paie un dimanche midi. */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { cle: 'saladbar' as const, Icone: Salad, titre: 'Saladbar', n: compteurs.saladbar },
          { cle: 'fridge' as const, Icone: Snowflake, titre: 'Frigo du bas', n: compteurs.fridge },
          { cle: 'desserts' as const, Icone: IceCream, titre: 'Frigo desserts', n: compteurs.desserts },
        ].map((tuile) => {
          const actif = filtreZone === tuile.cle;

          return (
            <button
              key={tuile.cle}
              type="button"
              aria-pressed={actif}
              onClick={() => setFiltreZone(actif ? null : tuile.cle)}
              className={cn(
                'rounded-2xl border p-3 text-left transition-colors',
                actif ? 'border-foreground bg-muted' : 'bg-card hover:bg-muted/50',
              )}
            >
              {/* Icône de trait, pas emoji : trois pastilles de couleurs
                  différentes se lisaient comme un décor, et l'œil
                  s'arrêtait dessus au lieu du nombre. */}
              <span
                aria-hidden
                className="bg-muted text-foreground/70 flex size-7 items-center justify-center rounded-lg"
              >
                <tuile.Icone className="size-4" strokeWidth={2.2} />
              </span>
              <span className="mt-1 block text-2xl leading-none font-black tabular-nums">
                {tuile.n}
              </span>
              <span
                className="text-muted-foreground mt-1 block text-[11px] leading-tight font-bold"
              >
                {tuile.titre}
              </span>
            </button>
          );
        })}
      </div>

      {(() => {
        const orphelins = actifs.filter(
          (product) => !product.in_saladbar && !product.in_fridge && !product.in_desserts,
        );
        if (orphelins.length === 0) return null;

        return (
          <p className="bg-alert text-alert-foreground border-alert-border flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[13px] font-bold">
            <CircleOff className="size-4 shrink-0" strokeWidth={2.6} />
            {orphelins.length} produit{orphelins.length > 1 ? 's ne sont' : ' n’est'} rangé
            {orphelins.length > 1 ? 's' : ''} dans aucun meuble : {orphelins.length > 1 ? 'ils n’apparaissent' : 'il n’apparaît'} dans aucun
            comptage.
          </p>
        );
      })()}

      {filtreZone ? (
        <p className="text-muted-foreground text-[13px] font-semibold">
          {visible.length} produit{visible.length > 1 ? 's' : ''} affiché
          {visible.length > 1 ? 's' : ''}.{' '}
          <button
            type="button"
            onClick={() => setFiltreZone(null)}
            className="text-primary font-black underline underline-offset-2"
          >
            Tout revoir
          </button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un produit…"
          className="h-10 max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Afficher les produits désactivés
        </label>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          Nouveau produit
        </Button>
      </div>

      {grouped.length === 0 ? (
        <Card className="p-8 text-center text-sm">Aucun produit ne correspond à la recherche.</Card>
      ) : null}

      {grouped.map(([category, items]) => (
        <section key={category} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black tracking-tight">
              {category} <span className="text-muted-foreground">({items.length})</span>
            </h2>
            <CategoryZoneShortcut items={items} />
          </div>

          <div className="space-y-2.5">
            {items.map((product) => (
              <CarteProduit
                key={product.id}
                product={product}
                onEdit={() => setEditing(product)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Une fiche produit, pensée pour un pouce.
 *
 * L'ancienne rangée alignait six contrôles minuscules et une liste de
 * cinq valeurs abrégées — « Relance sous la moitié de la cible »,
 * « Critique », « Cible 4 – 12 », « Base 30 » — toutes au même niveau
 * visuel. On ne savait plus laquelle répondait à quelle question.
 *
 * La carte répond à trois questions, dans l'ordre où elles se posent :
 * où est-il rangé, à partir de quand faut-il en refaire, et qu'est-ce
 * que j'en fais. Le reste (cible, base, DLC) vit dans « Modifier » :
 * ce sont des réglages qu'on touche une fois, pas au quotidien.
 */
function CarteProduit({
  product,
  onEdit,
}: {
  product: ProductWithCategory;
  onEdit: () => void;
}) {
  const nullePart = !product.in_saladbar && !product.in_fridge && !product.in_desserts;

  return (
    <div
      className={cn(
        'bg-card rounded-2xl border p-3.5 transition-colors',
        !product.is_active && 'opacity-60',
        nullePart && product.is_active && 'border-alert-border',
      )}
    >
      <div className="flex items-start gap-3">
        <VignetteProduit
          name={product.name}
          categoryName={product.category?.name}
          imageUrl={product.image_url}
          taille="sm"
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <QuickEdit product={product} />
            {!product.is_active ? (
              <Badge variant="outline" className="shrink-0">
                Désactivé
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 text-[11px] font-semibold">
            {product.unit === 'piece' ? 'pièce' : 'gastro'}
            {Number(product.base_qty) > 0 ? ` · base ${formatQty(Number(product.base_qty))}` : ''}
            {product.shelf_life_label ? ` · DLC ${product.shelf_life_label}` : ''}
          </p>
        </div>

        <InlinePriority product={product} />
      </div>

      {/* 1. Où est-il rangé ? Deux cibles larges, nommées en entier :
             « Haut » et « Bas » demandaient de se souvenir de quoi on
             parlait. Un produit rangé nulle part n'entre dans aucun
             comptage — la carte le dit au lieu de le laisser passer. */}
      <div className="mt-3">
        <p className="text-muted-foreground mb-1.5 text-[10px] font-black tracking-wide uppercase">
          Où est-il rangé
        </p>
        <ZonesProduit product={product} />
        {nullePart ? (
          <p className="text-alert-foreground mt-1.5 text-[11px] font-bold">
            Rangé nulle part : il n&apos;apparaîtra dans aucun comptage.
          </p>
        ) : null}
      </div>

      {/* 2. À partir de quand faut-il en refaire ? Les deux seuils
             côte à côte, chacun sous son intitulé en toutes lettres. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SeuilProduit product={product} type="minimum" />
        <SeuilProduit product={product} type="critique" />
      </div>

      {/* 3. Qu'est-ce que j'en fais ? */}
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        <InterrupteurActif product={product} />
        <Button variant="outline" size="sm" className="ml-auto h-9 rounded-xl" onClick={onEdit}>
          Modifier
        </Button>
        <BoutonSupprimer product={product} />
      </div>
    </div>
  );
}

/**
 * Les deux zones, en deux vraies cibles tactiles.
 *
 * Cas concret : les desserts ne vivent qu'au saladbar. Tant qu'ils sont
 * aussi marqués « frigo du bas », l'employé doit les relever deux fois,
 * dont une devant une étagère où ils ne se trouvent pas.
 */
function ZonesProduit({ product }: { product: ProductWithCategory }) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function regler(zones: { inSaladbar: boolean; inFridge: boolean; inDesserts: boolean }) {
    setErreur(null);
    startTransition(async () => {
      const resultat = await updateProductInline(product.id, zones);
      if (resultat.error) setErreur(resultat.error);
    });
  }

  const zones = [
    { cle: 'saladbar' as const, label: 'Saladbar', actif: product.in_saladbar },
    { cle: 'fridge' as const, label: 'Frigo du bas', actif: product.in_fridge },
    { cle: 'desserts' as const, label: 'Desserts', actif: product.in_desserts },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {zones.map((zone) => (
          <button
            key={zone.cle}
            type="button"
            disabled={pending}
            aria-pressed={zone.actif}
            onClick={() =>
              regler({
                inSaladbar: zone.cle === 'saladbar' ? !zone.actif : product.in_saladbar,
                inFridge: zone.cle === 'fridge' ? !zone.actif : product.in_fridge,
                inDesserts: zone.cle === 'desserts' ? !zone.actif : product.in_desserts,
              })
            }
            className={cn(
              'flex h-10 items-center justify-center gap-1 rounded-xl border px-1 text-[12px] font-bold transition-colors',
              zone.actif
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/60 border-dashed',
            )}
          >
            {zone.actif ? <Check className="size-3.5" strokeWidth={3.5} /> : null}
            {zone.label}
          </button>
        ))}
      </div>
      {erreur ? (
        <p className="text-destructive mt-1 text-[11px] font-semibold">{erreur}</p>
      ) : null}
    </>
  );
}

/**
 * Un seuil, avec son intitulé en toutes lettres.
 *
 * « Min auto » et « Min fixe » sur deux boutons collés ne disaient ni de
 * quoi il s'agissait, ni quelle valeur s'appliquait. Ici le bloc annonce
 * la règle en cours ; un appui bascule entre calculé et fixe, et le
 * champ n'apparaît que quand il y a un nombre à saisir.
 */
function SeuilProduit({
  product,
  type,
}: {
  product: ProductWithCategory;
  type: 'minimum' | 'critique';
}) {
  const [pending, startTransition] = useTransition();

  const minimum = type === 'minimum';
  const manuel = minimum ? product.min_mode === 'manual' : product.crit_mode === 'manual';
  const valeur = minimum ? product.min_qty_manual : product.crit_qty_manual;

  const [draft, setDraft] = useState(valeur === null ? '' : String(valeur));

  function basculer() {
    startTransition(async () => {
      const nombre = Number(draft.replace(',', '.')) || 1;
      await updateProductInline(
        product.id,
        minimum
          ? { minMode: manuel ? 'auto' : 'manual', minQtyManual: manuel ? null : nombre }
          : { critMode: manuel ? 'auto' : 'manual', critQtyManual: manuel ? null : nombre },
      );
    });
  }

  function enregistrer() {
    const nombre = Number(draft.replace(',', '.'));
    if (!Number.isFinite(nombre) || nombre < 0) return;
    if (nombre === Number(valeur)) return;
    startTransition(async () => {
      await updateProductInline(
        product.id,
        minimum ? { minQtyManual: nombre } : { critQtyManual: nombre },
      );
    });
  }

  return (
    <div className={cn('rounded-xl border p-2.5', !minimum && 'border-destructive/25')}>
      <p
        className={cn(
          'text-[10px] font-black tracking-wide uppercase',
          minimum ? 'text-muted-foreground' : 'text-destructive/80',
        )}
      >
        {minimum ? 'On en refait sous' : 'Seuil critique'}
      </p>

      <div className="mt-1.5 flex items-center gap-1.5">
        {manuel ? (
          <Input
            value={draft}
            inputMode="decimal"
            disabled={pending}
            aria-label={`${minimum ? 'Minimum' : 'Seuil critique'} de ${product.name}`}
            onChange={(evenement) => setDraft(evenement.target.value)}
            onBlur={enregistrer}
            className="h-9 w-14 rounded-lg text-center text-base font-black tabular-nums"
          />
        ) : (
          <span className="text-[13px] leading-tight font-bold">
            {minimum ? describeMinimum(product) : describeCritical(product)}
          </span>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={basculer}
          className="text-muted-foreground hover:text-foreground ml-auto shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-bold underline underline-offset-2"
        >
          {manuel ? 'auto' : 'fixer'}
        </button>
      </div>
    </div>
  );
}

/** L'interrupteur, avec son mot : un rail nu ne dit pas ce qu'il commande. */
function InterrupteurActif({ product }: { product: ProductWithCategory }) {
  const [pending, demarrer] = useTransition();

  return (
    <label className="flex items-center gap-2 text-[13px] font-bold">
      <Switch
        checked={product.is_active}
        disabled={pending}
        aria-label={product.is_active ? `Désactiver ${product.name}` : `Réactiver ${product.name}`}
        onCheckedChange={(coche) =>
          demarrer(async () => {
            await toggleProductActive(product.id, coche);
          })
        }
      />
      {product.is_active ? 'Compté' : 'Hors comptage'}
    </label>
  );
}

/**
 * Priorité réglable en un clic depuis le tableau, sans ouvrir de fiche.
 * C'est l'un des deux réglages que le directeur touchera le plus souvent.
 */
function InlinePriority({ product }: { product: ProductWithCategory }) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5" title="Priorité : 1 = le plus urgent">
      <span
        aria-hidden
        className={cn('size-2.5 rounded-full', PRIORITY_DOT[product.priority] ?? 'bg-neutral-300')}
      />
      <select
        value={product.priority}
        disabled={pending}
        aria-label={`Priorité de ${product.name}`}
        onChange={(event) => {
          const priority = Number(event.target.value);
          startTransition(async () => {
            await updateProductInline(product.id, { priority });
          });
        }}
        className="border-input bg-background h-8 rounded-md border px-1.5 text-xs tabular-nums"
      >
        {[1, 2, 3, 4, 5].map((level) => (
          <option key={level} value={level}>
            P{level}
          </option>
        ))}
      </select>
    </label>
  );
}

/** « Tous les desserts au saladbar uniquement », en un geste. */
function CategoryZoneShortcut({ items }: { items: ProductWithCategory[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const categoryId = items[0]?.category?.id;
  if (!categoryId) return null;

  function apply(zones: { inSaladbar: boolean; inFridge: boolean; inDesserts: boolean }) {
    setError(null);
    startTransition(async () => {
      const result = await setCategoryZones(categoryId!, zones);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-destructive text-xs font-semibold">{error}</span> : null}
      <span className="text-muted-foreground text-[11px] font-bold">Tout le rayon&nbsp;:</span>
      {[
        { label: 'Saladbar', zones: { inSaladbar: true, inFridge: false, inDesserts: false } },
        { label: 'Frigo du bas', zones: { inSaladbar: false, inFridge: true, inDesserts: false } },
        { label: 'Desserts', zones: { inSaladbar: false, inFridge: false, inDesserts: true } },
        { label: 'Haut + bas', zones: { inSaladbar: true, inFridge: true, inDesserts: false } },
      ].map((choice) => (
        <Button
          key={choice.label}
          size="sm"
          variant="outline"
          disabled={pending}
          className="h-8 rounded-full text-xs"
          onClick={() => apply(choice.zones)}
        >
          {choice.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * Supprimer un produit, ou apprendre pourquoi c'est impossible.
 *
 * Désactiver reste le bon geste dans la plupart des cas : un produit
 * retiré de la carte doit rester lisible dans les comptages passés. Mais
 * un produit créé par erreur, jamais compté, n'a aucune raison
 * d'encombrer la liste pour toujours.
 *
 * C'est la base qui tranche, et son message explique lequel des deux
 * gestes s'applique — on l'affiche tel quel plutôt que de deviner ici.
 */
function BoutonSupprimer({ product }: { product: ProductWithCategory }) {
  const [confirme, setConfirme] = useState(false);
  const [pending, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  if (erreur) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-destructive max-w-56 text-[11px] leading-snug font-semibold">
          {erreur}
        </span>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setErreur(null)}>
          OK
        </Button>
      </span>
    );
  }

  if (confirme) {
    return (
      <span className="flex items-center gap-1">
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          className="h-9 rounded-xl font-bold"
          onClick={() =>
            demarrer(async () => {
              const resultat = await supprimerProduit(product.id);
              if (resultat.error) {
                setErreur(resultat.error);
                setConfirme(false);
              }
            })
          }
        >
          Supprimer
        </Button>
        <Button variant="ghost" size="sm" className="h-9" onClick={() => setConfirme(false)}>
          Non
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive size-9 rounded-xl p-0"
      title={`Supprimer ${product.name}`}
      onClick={() => setConfirme(true)}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
