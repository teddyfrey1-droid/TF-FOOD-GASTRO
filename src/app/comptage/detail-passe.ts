'use server';

import { createClient } from '@/lib/supabase/server';

export interface DetailComptagePasse {
  relances: {
    productId: string;
    productName: string;
    qty: number;
    isDone: boolean;
    isCritical: boolean;
  }[];
  stocks: {
    productId: string;
    productName: string;
    qtySaladbar: number;
    qtyFridge: number;
    qtyDesserts: number;
    qtyTotal: number;
    inSaladbar: boolean;
    inFridge: boolean;
    inDesserts: boolean;
    etat: string;
    surplus: number;
  }[];
  error?: string;
}

/**
 * Ce qu'il y avait à faire, et ce qu'il y avait dans les frigos.
 *
 * Chargé à la demande, quand on déplie un comptage : trente journées ×
 * deux comptages × quarante produits feraient plusieurs milliers de
 * lignes à l'ouverture de l'écran, pour un détail qu'on consulte une fois
 * de temps en temps.
 *
 * Les deux fonctions appelées portent leur propre garde : un employé qui
 * devinerait un identifiant serait refusé par la base, pas par ce code.
 */
export async function chargerDetailComptage(sessionId: string): Promise<DetailComptagePasse> {
  const supabase = await createClient();

  const [rapport, stock] = await Promise.all([
    supabase.rpc('mep_reorder_report', { p_session_id: sessionId }),
    supabase.rpc('mep_etat_stock', { p_session_id: sessionId }),
  ]);

  if (rapport.error || stock.error) {
    return {
      relances: [],
      stocks: [],
      error: rapport.error?.message ?? stock.error?.message,
    };
  }

  return {
    relances: (rapport.data ?? []).map((ligne) => ({
      productId: ligne.product_id,
      productName: ligne.product_name,
      qty: Number(ligne.qty_to_produce),
      isDone: ligne.is_done,
      isCritical: ligne.is_critical,
    })),
    stocks: (stock.data ?? []).map((ligne) => ({
      productId: ligne.product_id,
      productName: ligne.product_name,
      qtySaladbar: Number(ligne.qty_saladbar),
      qtyFridge: Number(ligne.qty_fridge),
      qtyDesserts: Number(ligne.qty_desserts),
      qtyTotal: Number(ligne.qty_total),
      inSaladbar: ligne.in_saladbar,
      inFridge: ligne.in_fridge,
      inDesserts: ligne.in_desserts,
      etat: ligne.etat,
      surplus: Number(ligne.surplus),
    })),
  };
}
