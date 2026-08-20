/**
 * Génère les icônes et les écrans de démarrage iOS depuis `public/icons/icon.svg`.
 *
 *   pnpm pwa:assets
 *
 * iOS n'accepte un écran de démarrage QUE si son image correspond exactement à
 * la résolution de l'appareil : d'où cette liste explicite plutôt qu'une image
 * unique redimensionnée.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// sharp n'a pas de types embarqués utiles ici et ne sert qu'à ce script.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharp: any = require('sharp');

const ROOT = process.cwd();
const ICONS = path.join(ROOT, 'public/icons');
const SPLASH = path.join(ROOT, 'public/splash');

/** Écrans iPhone encore en service, en pixels physiques. */
export const IOS_SCREENS = [
  { width: 750, height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2 },
  { width: 828, height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2 },
  { width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3 },
  { width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3 },
  { width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3 },
  { width: 1242, height: 2688, deviceWidth: 414, deviceHeight: 896, ratio: 3 },
  { width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3 },
  { width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3 },
] as const;

// Vert cuisine de l'application : l'écran de démarrage iOS doit prolonger
// l'icône, pas afficher un aplat sombre qui n'existe nulle part ailleurs.
const BACKGROUND = { r: 47, g: 125, b: 85, alpha: 1 };

async function main(): Promise<void> {
  mkdirSync(ICONS, { recursive: true });
  mkdirSync(SPLASH, { recursive: true });

  const svg = readFileSync(path.join(ICONS, 'icon.svg'));

  for (const size of [180, 192, 512]) {
    await sharp(svg, { density: 400 })
      .resize(size, size)
      .png()
      .toFile(path.join(ICONS, `icon-${size}.png`));
  }

  // Icône « maskable » : le motif doit tenir dans les 80 % centraux, sinon
  // Android le rogne.
  await sharp(svg, { density: 400 })
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: BACKGROUND })
    .png()
    .toFile(path.join(ICONS, 'icon-maskable-512.png'));

  for (const screen of IOS_SCREENS) {
    const logo = Math.round(Math.min(screen.width, screen.height) * 0.32);
    const badge = await sharp(svg, { density: 400 }).resize(logo, logo).png().toBuffer();

    await sharp({
      create: {
        width: screen.width,
        height: screen.height,
        channels: 4,
        background: BACKGROUND,
      },
    })
      .composite([{ input: badge, gravity: 'center' }])
      .png()
      .toFile(path.join(SPLASH, `splash-${screen.width}x${screen.height}.png`));
  }

  console.log(
    `✅ ${3 + 1} icônes et ${IOS_SCREENS.length} écrans de démarrage générés.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
