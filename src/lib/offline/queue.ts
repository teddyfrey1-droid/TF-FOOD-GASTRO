/**
 * File d'attente des saisies, adossée à IndexedDB.
 *
 * L'employé compte dans une chambre froide, au sous-sol, avec un réseau qui
 * va et vient. La règle est simple : **une saisie n'est jamais perdue**. Elle
 * est écrite localement d'abord, envoyée ensuite, et rejouée au retour du
 * réseau — y compris après une fermeture de l'application.
 */

const DB_NAME = 'mep-offline';
const DB_VERSION = 1;
const STORE = 'pending-counts';

/** Une saisie en attente d'envoi. La clé écrase la précédente pour le même produit. */
export interface PendingCount {
  /** `${sessionId}:${productId}` — une seule saisie en attente par produit. */
  key: string;
  sessionId: string;
  productId: string;
  qtySaladbar: number;
  qtyFridge: number;
  qtyDesserts: number;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  /** Zones réellement relevées : l'employé compte en deux passes. */
  countedSaladbar: boolean;
  countedFridge: boolean;
  countedDesserts: boolean;
  /** Comptage remis à plus tard, avec son motif. */
  isDeferred: boolean;
  deferredReason: string | null;
  /** Horodatage local, pour ignorer une saisie périmée à la synchronisation. */
  updatedAt: number;
}

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Écriture locale impossible'));
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** Met une saisie en attente. Écrase toute saisie antérieure du même produit. */
export async function enqueue(entry: PendingCount): Promise<void> {
  if (!isAvailable()) return;
  try {
    await transact('readwrite', (store) => store.put(entry));
  } catch {
    // Mode privé, quota plein : on ne bloque pas le comptage pour autant.
    // La saisie reste en mémoire et partira au prochain envoi réussi.
  }
}

export async function dequeue(key: string, updatedAt: number): Promise<void> {
  if (!isAvailable()) return;
  try {
    const current = await transact<PendingCount | undefined>('readonly', (store) =>
      store.get(key),
    );
    // Une saisie plus récente est arrivée entre-temps : on la garde.
    if (current && current.updatedAt > updatedAt) return;
    await transact('readwrite', (store) => store.delete(key));
  } catch {
    // idem
  }
}

export async function listPending(sessionId?: string): Promise<PendingCount[]> {
  if (!isAvailable()) return [];
  try {
    const all = await transact<PendingCount[]>('readonly', (store) => store.getAll());
    return sessionId ? all.filter((entry) => entry.sessionId === sessionId) : all;
  } catch {
    return [];
  }
}

/** Vide les saisies d'une session validée : elles n'ont plus lieu d'être rejouées. */
export async function clearSession(sessionId: string): Promise<void> {
  const pending = await listPending(sessionId);
  await Promise.all(pending.map((entry) => dequeue(entry.key, entry.updatedAt)));
}

export function pendingKey(sessionId: string, productId: string): string {
  return `${sessionId}:${productId}`;
}
