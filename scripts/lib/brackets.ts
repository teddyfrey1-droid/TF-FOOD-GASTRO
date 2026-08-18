/**
 * Reconnaissance des colonnes de tranche de CA dans l'export du Google Sheet.
 *
 * Le Sheet peut écrire ses en-têtes de bien des façons ; on accepte les formes
 * les plus courantes plutôt que d'imposer un format au restaurant.
 */

export interface Bracket {
  header: string;
  /** Borne basse INCLUSE. null = pas de borne basse. */
  caMin: number | null;
  /** Borne haute EXCLUE. null = pas de borne haute. */
  caMax: number | null;
}

const toNumber = (raw: string): number => Number(raw.replace(/[\s ]/g, ''));

/** Renvoie les bornes d'une colonne de CA, ou null si l'en-tête n'en est pas une. */
export function parseBracketHeader(header: string): Bracket | null {
  const cleaned = header
    .toLowerCase()
    .replace(/\bca\b/g, '')
    .replace(/€|eur\b|euros?\b/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim();

  if (cleaned === '') return null;

  const range = /^(\d[\d\s ]*)\s*(?:-|–|—|à|to|\.\.)\s*(\d[\d\s ]*)$/.exec(cleaned);
  if (range) {
    const caMin = toNumber(range[1]);
    const caMax = toNumber(range[2]);
    return Number.isFinite(caMin) && Number.isFinite(caMax) && caMin < caMax
      ? { header, caMin, caMax }
      : null;
  }

  const below = /^(?:<|≤|moins de|jusqu'?à|inférieur à)\s*(\d[\d\s ]*)$/.exec(cleaned);
  if (below) {
    const caMax = toNumber(below[1]);
    return Number.isFinite(caMax) ? { header, caMin: null, caMax } : null;
  }

  const above = /^(?:>|≥|plus de|à partir de|au-delà de)?\s*(\d[\d\s ]*)\s*(?:\+|et plus)?$/.exec(
    cleaned,
  );
  if (above && /[+>≥]|et plus|plus de|à partir de|au-delà de/.test(cleaned)) {
    const caMin = toNumber(above[1]);
    return Number.isFinite(caMin) ? { header, caMin, caMax: null } : null;
  }

  return null;
}

/**
 * Vérifie que les tranches couvrent le CA sans trou ni chevauchement.
 * Un trou signifie qu'à ce CA-là, aucune cible ne serait trouvée.
 */
export function checkBracketCoverage(brackets: readonly Bracket[]): string[] {
  const problems: string[] = [];
  const sorted = [...brackets].sort((a, b) => (a.caMin ?? -Infinity) - (b.caMin ?? -Infinity));

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.caMax === null) {
      problems.push(`« ${current.header} » n'a pas de borne haute mais n'est pas la dernière.`);
      continue;
    }
    if (next.caMin === null) continue;

    if (current.caMax < next.caMin) {
      problems.push(
        `Trou entre ${current.caMax} € et ${next.caMin} € : aucune cible ne serait trouvée dans cet intervalle.`,
      );
    } else if (current.caMax > next.caMin) {
      problems.push(
        `Chevauchement entre « ${current.header} » et « ${next.header} » : la première tranche gagnera.`,
      );
    }
  }

  if (sorted.length > 0 && sorted[sorted.length - 1].caMax !== null) {
    problems.push(
      `La dernière tranche s'arrête à ${sorted[sorted.length - 1].caMax} € : au-delà, aucune cible ne serait trouvée.`,
    );
  }

  return problems;
}
