// SPDX-License-Identifier: GPL-3.0-or-later
import data from '../../assets/demo/screenshots/demo-results.json';
import cults3d from '../../assets/demo/screenshots/Demo-Cults3D.png?url';
import makerworld from '../../assets/demo/screenshots/Demo-MakerWorld.png?url';
import myminifactory from '../../assets/demo/screenshots/Demo-MyMiniFactory.png?url';
import printables from '../../assets/demo/screenshots/Demo-Printables.png?url';
import thangs from '../../assets/demo/screenshots/Demo-Thangs.png?url';
import thingiverse from '../../assets/demo/screenshots/Demo-Thingiverse.png?url';

export const SCREENSHOT_FIXTURE_VERSION = 1;
export type ScreenshotTileMode = 'aggregated' | 'direct-search';
export interface ScreenshotTile {
  providerId: string;
  providerName: string;
  title: string;
  creator?: string;
  thumbnail: string;
  mode: ScreenshotTileMode;
}

const images: Record<string, string> = {
  'Demo-Cults3D.png': cults3d,
  'Demo-MakerWorld.png': makerworld,
  'Demo-MyMiniFactory.png': myminifactory,
  'Demo-Printables.png': printables,
  'Demo-Thangs.png': thangs,
  'Demo-Thingiverse.png': thingiverse,
};

const expected = ['printables', 'thingiverse', 'myminifactory', 'cults3d', 'makerworld', 'thangs'];
export const screenshotTiles: readonly ScreenshotTile[] = data.map((tile) => ({
  ...tile,
  mode: tile.mode as ScreenshotTileMode,
  thumbnail: images[tile.thumbnail] ?? '',
}));

export function validateScreenshotTiles(tiles: readonly ScreenshotTile[] = screenshotTiles): void {
  if (tiles.length !== 6) throw new Error('Screenshot fixture must contain exactly six tiles.');
  const ids = tiles.map((tile) => tile.providerId);
  if (new Set(ids).size !== 6 || expected.some((id) => !ids.includes(id))) throw new Error('Screenshot fixture must contain every supported repository exactly once.');
  if (tiles.filter((tile) => tile.mode === 'aggregated').length !== 4
    || tiles.filter((tile) => tile.mode === 'direct-search').length !== 2) throw new Error('Screenshot fixture must contain four aggregated and two direct-search tiles.');
  for (const tile of tiles) {
    const imagePath = tile.thumbnail ? new URL(tile.thumbnail, 'https://packaged.invalid/').pathname : '';
    if (!/\/Demo-[A-Za-z0-9]+-[A-Za-z0-9_-]+\.png$/.test(imagePath) && !/\/Demo-[A-Za-z0-9]+\.png$/.test(imagePath)) throw new Error(`Screenshot thumbnail must be packaged locally: ${tile.providerId}`);
    if (['makerworld', 'thangs'].includes(tile.providerId) !== (tile.mode === 'direct-search')) throw new Error(`${tile.providerId} has an incorrect screenshot mode.`);
  }
}
