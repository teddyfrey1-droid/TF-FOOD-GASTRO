/**
 * Utilitaires de semaine ISO 8601, en UTC pur (pas de fuseau, pas d'heure d'été).
 *
 * Le cahier des charges (§5.1) impose de retrouver « le même jour de semaine,
 * la même semaine ISO, l'année N-1 ». On raisonne donc en (année ISO, semaine
 * ISO, jour ISO) et jamais en date calendaire.
 */

/** Date au format `YYYY-MM-DD` (le seul format manipulé côté métier). */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;

export function parseIsoDate(date: IsoDate): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Date invalide (attendu YYYY-MM-DD): ${date}`);
  const [, y, m, d] = match;
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    parsed.getUTCFullYear() !== Number(y) ||
    parsed.getUTCMonth() !== Number(m) - 1 ||
    parsed.getUTCDate() !== Number(d)
  ) {
    throw new Error(`Date inexistante au calendrier: ${date}`);
  }
  return parsed;
}

export function formatIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(new Date(parseIsoDate(date).getTime() + days * MS_PER_DAY));
}

/** Jour ISO de la semaine : 1 = lundi ... 7 = dimanche. */
export function isoWeekday(date: IsoDate): number {
  const day = parseIsoDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Jeudi de la semaine ISO contenant `date` (le jeudi porte l'année ISO). */
function isoThursday(date: IsoDate): Date {
  const d = parseIsoDate(date);
  return new Date(d.getTime() + (4 - isoWeekday(date)) * MS_PER_DAY);
}

/** Année ISO (peut différer de l'année calendaire fin décembre / début janvier). */
export function isoWeekYear(date: IsoDate): number {
  return isoThursday(date).getUTCFullYear();
}

/** Numéro de semaine ISO (1 à 53). */
export function isoWeekNumber(date: IsoDate): number {
  const thursday = isoThursday(date);
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const jan4Weekday = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4.getTime() - (jan4Weekday - 1) * MS_PER_DAY);
  return Math.round((thursday.getTime() - week1Monday.getTime()) / (7 * MS_PER_DAY)) + 1;
}

/** Nombre de semaines ISO d'une année ISO (52 ou 53). */
export function isoWeeksInYear(year: number): number {
  return isoWeekNumber(`${year}-12-28`);
}

/** Date correspondant à un triplet (année ISO, semaine ISO, jour ISO). */
export function dateFromIsoWeek(year: number, week: number, weekday: number): IsoDate {
  if (weekday < 1 || weekday > 7) throw new Error(`Jour ISO invalide: ${weekday}`);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = jan4.getTime() - (jan4Weekday - 1) * MS_PER_DAY;
  return formatIsoDate(new Date(week1Monday + ((week - 1) * 7 + (weekday - 1)) * MS_PER_DAY));
}

/**
 * Date de référence N-1 : même semaine ISO, même jour de semaine, année ISO - 1.
 *
 * Si l'année N-1 ne compte que 52 semaines alors que J tombe en semaine 53,
 * on retombe sur la semaine 52 (dernière semaine disponible).
 */
export function referenceDateLastYear(date: IsoDate): IsoDate {
  const targetYear = isoWeekYear(date) - 1;
  const week = Math.min(isoWeekNumber(date), isoWeeksInYear(targetYear));
  return dateFromIsoWeek(targetYear, week, isoWeekday(date));
}
