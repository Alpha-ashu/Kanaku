#!/usr/bin/env node
/**
 * Generates the native app icons and splashes for both Android and iOS from the vector brand mark (logo.svg).
 *
 * Usage: node scripts/gen-app-icons.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'sharp is not installed. Run `npm install` at the repo root.',
  );
  process.exit(1);
}

const ROOT = process.cwd();
const SVG = path.join(ROOT, 'play-store-assets', 'logo.svg');
const BACKGROUND = '#FFFFFF';

const iosTargets = [
  {
    out: path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'),
    size: 1024,
    artRatio: 0.78,
    label: 'iOS app icon',
    opaque: true,
  },
  {
    out: path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png'),
    size: 2732,
    artRatio: 0.22,
    label: 'iOS splash',
    opaque: true,
  },
];

const SPLASH_COPIES = [
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
];

const androidIcons = [
  // mdpi
  { out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png', size: 48, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', size: 48, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', size: 108, artRatio: 0.65, opaque: false },
  // hdpi
  { out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png', size: 72, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', size: 72, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', size: 162, artRatio: 0.65, opaque: false },
  // xhdpi
  { out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', size: 96, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', size: 96, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', size: 216, artRatio: 0.65, opaque: false },
  // xxhdpi
  { out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', size: 144, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', size: 144, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', size: 324, artRatio: 0.65, opaque: false },
  // xxxhdpi
  { out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', size: 192, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', size: 192, artRatio: 0.78, opaque: true },
  { out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', size: 432, artRatio: 0.65, opaque: false },
  // drawables
  { out: 'android/app/src/main/res/drawable/ic_launcher_foreground.png', size: 432, artRatio: 0.65, opaque: false },
  { out: 'android/app/src/main/res/drawable/splash.png', width: 480, height: 800, artSize: 180, opaque: true },
];

const androidSplashes = [
  // Port
  { out: 'android/app/src/main/res/drawable-port-mdpi/splash.png', width: 320, height: 480, artSize: 120 },
  { out: 'android/app/src/main/res/drawable-port-hdpi/splash.png', width: 480, height: 800, artSize: 180 },
  { out: 'android/app/src/main/res/drawable-port-xhdpi/splash.png', width: 720, height: 1280, artSize: 260 },
  { out: 'android/app/src/main/res/drawable-port-xxhdpi/splash.png', width: 960, height: 1600, artSize: 360 },
  { out: 'android/app/src/main/res/drawable-port-xxxhdpi/splash.png', width: 1080, height: 1920, artSize: 420 },
  // Land
  { out: 'android/app/src/main/res/drawable-land-mdpi/splash.png', width: 480, height: 320, artSize: 120 },
  { out: 'android/app/src/main/res/drawable-land-hdpi/splash.png', width: 800, height: 480, artSize: 180 },
  { out: 'android/app/src/main/res/drawable-land-xhdpi/splash.png', width: 1280, height: 720, artSize: 260 },
  { out: 'android/app/src/main/res/drawable-land-xxhdpi/splash.png', width: 1600, height: 960, artSize: 360 },
  { out: 'android/app/src/main/res/drawable-land-xxxhdpi/splash.png', width: 1920, height: 1080, artSize: 420 },
];

async function renderSquare({ out, size, artRatio, label, opaque }) {
  const fullPath = path.isAbsolute(out) ? out : path.join(ROOT, out);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const art = Math.round(size * artRatio);
  const svg = fs.readFileSync(SVG);

  const foreground = await sharp(svg, { density: 600 })
    .resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  let img = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? BACKGROUND : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: foreground, gravity: 'centre' }]);

  if (opaque) {
    img = img.flatten({ background: BACKGROUND }).removeAlpha();
  }

  await img.png({ compressionLevel: 9 }).toFile(fullPath);
  console.log(`✓ Generated icon: ${path.relative(ROOT, fullPath)} (${size}x${size})`);
}

async function renderSplash({ out, width, height, artSize }) {
  const fullPath = path.isAbsolute(out) ? out : path.join(ROOT, out);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const svg = fs.readFileSync(SVG);
  const foreground = await sharp(svg, { density: 600 })
    .resize(artSize, artSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: foreground, gravity: 'centre' }])
    .flatten({ background: BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(fullPath);

  console.log(`✓ Generated splash: ${path.relative(ROOT, fullPath)} (${width}x${height})`);
}

async function main() {
  console.log('Generating iOS and Android Icons from logo.svg...');

  for (const t of iosTargets) {
    if (fs.existsSync(path.dirname(t.out))) {
      await renderSquare(t);
    }
  }

  const splashSource = iosTargets.find((t) => t.label === 'iOS splash')?.out;
  if (splashSource && fs.existsSync(splashSource)) {
    for (const copy of SPLASH_COPIES) {
      const dest = path.join(ROOT, copy);
      if (fs.existsSync(path.dirname(dest))) {
        fs.copyFileSync(splashSource, dest);
        console.log(`✓ ${'iOS splash copy'.padEnd(14)} ${path.relative(ROOT, dest)}`);
      }
    }
  }

  for (const t of androidIcons) {
    if (t.size) {
      await renderSquare(t);
    } else {
      await renderSplash(t);
    }
  }

  for (const s of androidSplashes) {
    await renderSplash(s);
  }

  console.log('All brand icons and splashes generated successfully!');
}

main().catch(err => {
  console.error('Failed generating icons:', err);
  process.exit(1);
});
