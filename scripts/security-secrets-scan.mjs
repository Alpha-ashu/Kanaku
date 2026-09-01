import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'AWS Access Key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Stripe Live Secret Key', pattern: /\bsk_live_[0-9a-zA-Z]{24,}\b/ },
  { name: 'Razorpay Live Secret Key', pattern: /\brzp_live_[0-9a-zA-Z]{14,}\b/ },
  { name: 'Generic Hardcoded JWT Secret', pattern: /JWT_SECRET\s*=\s*['"][a-zA-Z0-9_\-]{32,}['"]/ },
  { name: 'Hardcoded Production DB Password', pattern: /postgres:\/\/[a-zA-Z0-9_]+:([a-zA-Z0-9!@#$%^&*()_+=-]{8,})@/ },
];

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.gemini',
  'generated',
  'android/.gradle',
  'ios/Pods',
]);

const IGNORED_FILES = new Set([
  '.env.example',
  '.env.test.example',
  'package-lock.json',
]);

let scannedFiles = 0;
let violations = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) continue;
      // Skip non-text / large binary files
      if (/\.(png|jpg|jpeg|webp|ico|svg|pdf|jar|aar|aab|apk|mp4|webm)$/i.test(entry.name)) continue;
      scannedFiles++;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const rule of FORBIDDEN_PATTERNS) {
          const match = content.match(rule.pattern);
          if (match) {
            // Check if it's a test or dummy placeholder
            if (content.includes('dummy') || content.includes('mock') || content.includes('example') || content.includes('localhost')) {
              continue;
            }
            violations.push({ file: fullPath, rule: rule.name, match: match[0].substring(0, 15) + '...' });
          }
        }
      } catch (err) {
        // Skip unreadable files
      }
    }
  }
}

console.log('=================================================================');
console.log('            KANAKU REPO & ARTIFACTS SECRETS AUDIT                ');
console.log('=================================================================\n');

scanDirectory(process.cwd());

console.log(`Scanned ${scannedFiles} source files.`);
if (violations.length === 0) {
  console.log('\n[PASS] No hardcoded production secrets, API keys, or private keys detected.\n');
} else {
  console.error(`\n[FAIL] Found ${violations.length} potential secrets violations:`);
  for (const v of violations) {
    console.error(`  - ${v.file}: ${v.rule} (${v.match})`);
  }
  process.exit(1);
}
