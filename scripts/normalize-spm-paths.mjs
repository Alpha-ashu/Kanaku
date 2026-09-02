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

// 1. Ensure @capacitor-community/speech-recognition has a Package.swift
const SPEECH_RECOGNITION_DIR = path.join('node_modules', '@capacitor-community', 'speech-recognition');
const SPEECH_RECOGNITION_MANIFEST = path.join(SPEECH_RECOGNITION_DIR, 'Package.swift');

if (fs.existsSync(SPEECH_RECOGNITION_DIR)) {
  const speechPackageSwift = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorCommunitySpeechRecognition",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorCommunitySpeechRecognition",
            targets: ["SpeechRecognitionPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0")
    ],
    targets: [
        .target(
            name: "SpeechRecognitionPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Plugin",
            exclude: ["Info.plist", "Plugin.m", "Plugin.h"]
        )
    ]
)
`;
  fs.writeFileSync(SPEECH_RECOGNITION_MANIFEST, speechPackageSwift);
  console.log(`[spm] Ensured Package.swift for @capacitor-community/speech-recognition`);

  const pluginSwiftPath = path.join(SPEECH_RECOGNITION_DIR, 'ios', 'Plugin', 'Plugin.swift');
  if (fs.existsSync(pluginSwiftPath)) {
    let pluginSwift = fs.readFileSync(pluginSwiftPath, 'utf8');
    if (!pluginSwift.includes('CAPBridgedPlugin')) {
      pluginSwift = pluginSwift.replace(
        'public class SpeechRecognition: CAPPlugin {',
        `public class SpeechRecognition: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechRecognitionPlugin"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
    ]`
      );
      fs.writeFileSync(pluginSwiftPath, pluginSwift);
      console.log(`[spm] Patched Plugin.swift with CAPBridgedPlugin for Capacitor 8`);
    }
  }
}

const MANIFEST = path.join('ios', 'App', 'CapApp-SPM', 'Package.swift');

if (!fs.existsSync(MANIFEST)) {
  // No iOS platform in this checkout (or sync has not run yet) — nothing to do.
  process.exit(0);
}

let content = fs.readFileSync(MANIFEST, 'utf8');

// Normalise backslashes to forward slashes
content = content.replace(
  /path: "([^"]+)"/g,
  (_match, value) => `path: "${value.split('\\').join('/')}"`,
);

// Inject SpeechRecognition into dependencies if missing
if (!content.includes('CapacitorCommunitySpeechRecognition')) {
  content = content.replace(
    /dependencies:\s*\[([\s\S]*?)(\n\s*\]\s*,\s*\n\s*targets:)/,
    (_match, deps, end) => {
      const speechDep = `        .package(name: "CapacitorCommunitySpeechRecognition", path: "../../../node_modules/@capacitor-community/speech-recognition"),\n`;
      return `dependencies: [\n${speechDep}${deps.trimEnd()}${end}`;
    }
  );

  content = content.replace(
    /name:\s*"CapApp-SPM",\s*\n\s*dependencies:\s*\[([\s\S]*?)(\n\s*\]\s*\n\s*\)\s*\])/,
    (_match, targetDeps, end) => {
      const speechTargetDep = `                .product(name: "CapacitorCommunitySpeechRecognition", package: "CapacitorCommunitySpeechRecognition"),\n`;
      return `name: "CapApp-SPM",\n            dependencies: [\n${speechTargetDep}${targetDeps.trimEnd()}${end}`;
    }
  );
}

fs.writeFileSync(MANIFEST, content);
console.log(`[spm] Linked SpeechRecognition and normalised Windows path separators in ${MANIFEST}`);
