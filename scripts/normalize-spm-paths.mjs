#!/usr/bin/env node
/**
 * Normalises the local package paths in the generated iOS Swift Package manifest.
 *
 * `npx cap sync ios` run on Windows writes native path separators into
 * ios/App/CapApp-SPM/Package.swift:
 *
 *     .package(name: "CapacitorApp", path: "..\..\..\node_modules\@capacitor\app")
 *
 * Swift Package Manager cannot resolve those on macOS, so an iOS project synced from
 * a Windows machine fails to build for everyone else. Forward slashes work on every
 * platform, so this rewrite is safe to run unconditionally.
 *
 * Wired into the `cap:sync:ios` / `mobile:build:ios` npm scripts; also safe to run
 * by hand after any `npx cap sync`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MANIFEST = path.join('ios', 'App', 'CapApp-SPM', 'Package.swift');

if (!fs.existsSync(MANIFEST)) {
  // No iOS platform in this checkout (or sync has not run yet) — nothing to do.
  process.exit(0);
}

const original = fs.readFileSync(MANIFEST, 'utf8');
const normalised = original.replace(
  /path: "([^"]+)"/g,
  (_match, value) => `path: "${value.split('\\').join('/')}"`,
);

if (normalised === original) {
  process.exit(0);
}

fs.writeFileSync(MANIFEST, normalised);
console.log(`[spm] Normalised Windows path separators in ${MANIFEST}`);
