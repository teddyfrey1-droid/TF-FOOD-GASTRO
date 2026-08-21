/** Formatage francophone partagé par tout l'écran. */

const EURO = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const DATE_LONG = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return EURO.format(value);
}

/** Affiche une quantité en gastros : « 5 gastros », « 1,5 gastro », « 0,5 gastro ». */
export function formatBacs(qty: number): string {
  const text = qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `${text} ${qty > 1 ? 'gastros' : 'gastro'}`;
}

/** Quantité brute, sans unité : « 1,5 ». */
export function formatQty(qty: number | null | undefined): string {
  if (qty === null || qty === undefined) return '—';
  return qty.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`;
}

/** « 1 h 20 » plutôt que « 80 minutes ». */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

export function formatDateLong(isoDate: string): string {
  return DATE_LONG.format(new Date(`${isoDate}T12:00:00Z`));
}

export function formatDateShort(isoDate: string): string {
  return DATE_SHORT.format(new Date(`${isoDate}T12:00:00Z`));
}

/** Date du jour à Paris, au format YYYY-MM-DD. */
export function todayInParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * L'heure d'ouverture d'un comptage, si elle n'est pas encore passée.
 *
 * Renvoie « 15h00 » tant qu'il est trop tôt, et `null` dès que l'heure
 * est atteinte — l'appelant n'a donc qu'un booléen implicite à lire.
 * Tout se compare en heure de Paris : le serveur, lui, tourne en UTC.
 */
export function ouvertureAVenir(heure: string | null | undefined): string | null {
  if (!heure) return null;

  const [h, m] = heure.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const maintenant = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Paris',
  }).format(new Date());

  const [hNow, mNow] = maintenant.split(':').map(Number);
  const passee = hNow * 60 + mNow >= h * 60 + m;

  return passee ? null : `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}
