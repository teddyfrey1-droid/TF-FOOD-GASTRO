import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';

/**
 * Identifiant de la version publiée.
 *
 * Il est figé au moment du `next build` et embarqué dans le code envoyé au
 * téléphone. L'application compare SA version à celle que le serveur
 * annonce sur `/api/version`, et propose de se mettre à jour — c'est le
 * seul moyen fiable de sortir une application déjà installée d'une version
 * périmée, puisqu'elle est relancée depuis le sélecteur d'applications sans
 * jamais recharger la page.
 *
 * ⚠️ Ce fichier est évalué PLUSIEURS FOIS par build (une passe serveur, une
 * passe client). La valeur doit donc être déterministe : un `Date.now()`
 * donnait deux identifiants différents dans un même build, et l'application
 * se croyait éternellement périmée.
 */
function versionPubliee(): string {
  const surVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (surVercel) return surVercel.slice(0, 12);
  if (process.env.BUILD_ID) return process.env.BUILD_ID;

  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Ni Vercel ni dépôt git : une constante vaut mieux qu'un identifiant
    // instable, qui ferait clignoter la proposition de mise à jour.
    return 'dev';
  }
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: versionPubliee() },
};

export default nextConfig;
