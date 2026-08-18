/**
 * Écrans de démarrage iOS.
 *
 * Safari n'accepte une image que si sa `media query` correspond exactement à
 * l'appareil : taille logique, densité et orientation. D'où cette table, qui
 * doit rester alignée sur `scripts/generate-pwa-assets.ts`.
 */

export interface SplashScreen {
  width: number;
  height: number;
  deviceWidth: number;
  deviceHeight: number;
  ratio: number;
}

export const IOS_SPLASH_SCREENS: readonly SplashScreen[] = [
  { width: 750, height: 1334, deviceWidth: 375, deviceHeight: 667, ratio: 2 },
  { width: 828, height: 1792, deviceWidth: 414, deviceHeight: 896, ratio: 2 },
  { width: 1125, height: 2436, deviceWidth: 375, deviceHeight: 812, ratio: 3 },
  { width: 1170, height: 2532, deviceWidth: 390, deviceHeight: 844, ratio: 3 },
  { width: 1179, height: 2556, deviceWidth: 393, deviceHeight: 852, ratio: 3 },
  { width: 1242, height: 2688, deviceWidth: 414, deviceHeight: 896, ratio: 3 },
  { width: 1284, height: 2778, deviceWidth: 428, deviceHeight: 926, ratio: 3 },
  { width: 1290, height: 2796, deviceWidth: 430, deviceHeight: 932, ratio: 3 },
];

export function splashMediaQuery(screen: SplashScreen): string {
  return (
    `(device-width: ${screen.deviceWidth}px) and (device-height: ${screen.deviceHeight}px) ` +
    `and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`
  );
}

export function splashHref(screen: SplashScreen): string {
  return `/splash/splash-${screen.width}x${screen.height}.png`;
}
