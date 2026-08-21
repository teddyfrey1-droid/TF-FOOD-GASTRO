import 'server-only';

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Alphabet sans caractère ambigu : ni O/0, ni I/1/l.
 *
 * Un code se dicte au téléphone dans une cuisine bruyante. Chaque
 * caractère doit s'entendre sans être épelé deux fois.
 */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

/** Un code de huit caractères, groupés par quatre pour la lecture. */
export function genererCode(): string {
  const lettres = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${lettres.slice(0, 4).join('')}-${lettres.slice(4).join('')}`;
}

/**
 * Empreinte du code, telle qu'elle est stockée.
 *
 * La base ne voit jamais le code lui-même : quelqu'un qui lirait la
 * table n'y trouverait rien d'utilisable. Même discipline que pour un
 * mot de passe.
 */
export function empreinte(code: string): string {
  return createHash('sha256').update(normaliserCode(code)).digest('hex');
}

/**
 * Ce qu'on compare vraiment : sans tirets, sans espaces, en majuscules.
 *
 * La personne recopie ce qu'elle voit, avec ou sans tiret, parfois en
 * minuscules. Refuser pour ça serait une brimade.
 */
export function normaliserCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** Comparaison à temps constant, pour ne rien apprendre par la durée. */
export function memeEmpreinte(a: string, b: string): boolean {
  const tamponA = Buffer.from(a, 'utf8');
  const tamponB = Buffer.from(b, 'utf8');
  if (tamponA.length !== tamponB.length) return false;
  return timingSafeEqual(tamponA, tamponB);
}
