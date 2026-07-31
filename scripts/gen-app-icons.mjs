#!/usr/bin/env node
/**
 * Generates the native app icons (and the iOS splash) from the vector brand mark.
 *
 * Why this exists: the repo had no raster source usable as an iOS app icon. The
 * largest brand PNG was 192x192 (an Android mipmap) and `play-store-assets/
 * icon_512x512.png` is actually a JPEG despite the extension — upscaling either
 * gives a soft icon on the most visible surface Apple shows. `logo.svg` is the real
 * source of truth, so everything is rasterised from vector at the exact size needed.
 *
 * Apple constraint: the App Store icon must be opaque — a PNG carrying an alpha
 * channel is rejected at upload, even if every pixel is fully opaque. `flatten()`
 * composites onto the brand background and drops the channel; the check at the end
 * asserts we actually emitted 3 channels, so a regression fails the script rather
 * than App Store Connect.
 *
 * Usage: node scripts/gen-app-icons.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// sharp arrives transitively (backend dependency, hoisted to the root by npm
// workspaces). Resolved dynamically so this stays a build-time-only tool rather
// than a declared root dependency.
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'sharp is not installed. Run `npm install` at the repo root, or `npm i -D sharp` if it has been dropped from the tree.',
  );
  process.exit(1);
}

const ROOT = process.cwd();
const SVG = path.join(ROOT, 'play-store-assets', 'logo.svg');

/** Matches android/app/src/main/res/values/ic_launcher_background.xml. */
const BACKGROUND = '#FFFFFF';

const targets = [
  {
    // iOS marketing/app icon. Capacitor's asset catalog points at this single file.
    out: path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'),
    size: 1024,
    // The mark spans its whole viewBox, so it needs padding of its own; ~78% keeps
    // it clear of the corner radius iOS applies without looking lost.
    artRatio: 0.78,
    label: 'iOS app icon',
  },
  {
    // iOS launch screen. One square image scaled to fill every device/orientation,
    // so the mark sits small and centred on a plain field.
    out: path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png'),
    size: 2732,
    artRatio: 0.22,
    label: 'iOS splash',
  },
];

// Capacitor's splash imageset references three identical files (@1x/@2x/@3x slots).
const SPLASH_COPIES = [
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
];

async function render({ out, size, artRatio, label }) {
  const art = Math.round(size * artRatio);
  const svg = fs.readFileSync(SVG);

  // Rasterise the vector at the final pixel size — never upscale a bitmap.
  const foreground = await sharp(svg, { density: 600 })
    .resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: foreground, gravity: 'centre' }])
    // flatten() composites the transparency away, but sharp still writes an RGBA
    // PNG unless the channel is dropped explicitly — which is precisely the state
    // App Store Connect rejects. Both calls are needed.
    .flatten({ background: BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(out);

  const meta = await sharp(out).metadata();
  if (meta.channels !== 3 || meta.hasAlpha) {
    throw new Error(
      `${label}: expected an opaque 3-channel PNG, got channels=${meta.channels} hasAlpha=${meta.hasAlpha}. ` +
        'Apple rejects app icons with an alpha channel.',
    );
  }
  if (meta.width !== size || meta.height !== size) {
    throw new Error(`${label}: expected ${size}x${size}, got ${meta.width}x${meta.height}`);
  }

  console.log(`✓ ${label.padEnd(14)} ${meta.width}x${meta.height} ${meta.channels}ch  ${path.relative(ROOT, out)}`);
}

for (const target of targets) {
  if (!fs.existsSync(path.dirname(target.out))) {
    console.log(`- skipped ${target.label}: ${path.relative(ROOT, path.dirname(target.out))} does not exist`);
    continue;
  }
  await render(target);
}

const splashSource = targets.find((t) => t.label === 'iOS splash')?.out;
if (splashSource && fs.existsSync(splashSource)) {
  for (const copy of SPLASH_COPIES) {
    const dest = path.join(ROOT, copy);
    if (fs.existsSync(path.dirname(dest))) {
      fs.copyFileSync(splashSource, dest);
      console.log(`✓ ${'iOS splash copy'.padEnd(14)} ${path.relative(ROOT, dest)}`);
    }
  }
}
