import Link from 'next/link';

/**
 * L'accès à son compte, en haut à droite.
 *
 * Il était en double : une tuile sur l'accueil ET un onglet en bas. Un
 * avatar à initiale règle les deux — c'est la convention de toutes les
 * applications que l'équipe utilise déjà, il se touche au pouce sur la
 * diagonale libre de l'écran, et il libère une place dans la barre du bas.
 */
export function AvatarCompte({ nom }: { nom: string }) {
  const initiale = nom.trim().charAt(0).toUpperCase() || '?';

  return (
    <Link
      href="/compte"
      aria-label="Mon compte"
      className="bg-primary text-primary-foreground no-select flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-black shadow-sm transition-transform active:scale-95"
    >
      {initiale}
    </Link>
  );
}
