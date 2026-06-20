#!/usr/bin/env node
/**
 * Read-only admin API capture (authorised QA helper).
 *
 * Logs in as the demo ADMIN account and runs the api-report in READ-ONLY mode
 * (GET endpoints only, no seeding, zero DB writes) so role-gated GET responses
 * can be captured and backfilled into the contracts as expected responses via
 * `npm run qa:contract-audit --write-expected`.
 *
 * Credentials are never passed on a command line — they are read from a local
 * file inside this process:
 *   QA_CREDS_FILE   path to a file containing the admin creds
 *                   (default: the demo-accounts memory note for this project)
 * The file is parsed for an `admin@... | <password>` table row.
 *
 * Run from repo root:  npm run qa:admin-capture   (requires the backend running)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const readEnv = (name) => {
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    return m ? m[1].replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
};

const credsFile = process.env.QA_CREDS_FILE ||
  path.join(os.homedir(), '.claude', 'projects', 'k--Project-kenku-Finora', 'memory', 'project_demo_accounts.md');

let email = process.env.QA_EMAIL || '';
let password = process.env.QA_PASSWORD || '';
if (!email || !password) {
  let text = '';
  try { text = fs.readFileSync(credsFile, 'utf8'); }
  catch { console.error(`Could not read creds file: ${credsFile}\nSet QA_CREDS_FILE or QA_EMAIL/QA_PASSWORD.`); process.exit(1); }
  const row = text.match(/\|\s*admin\s*\|\s*(admin@\S+)\s*\|\s*(\S+)\s*\|/i) || text.match(/(admin@\S+)\s*\|\s*(\S+)/);
  if (!row) { console.error('No admin row found in creds file.'); process.exit(1); }
  email = email || row[1];
  password = password || row[2];
}

console.log(`• Read-only admin capture as ${email} (credentials read from ${path.basename(credsFile)}, not the command line)`);

const res = spawnSync(process.execPath, [path.join(ROOT, 'quality', 'api', 'runner', 'run-api-report.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, QA_EMAIL: email, QA_PASSWORD: password, QA_READONLY: '1', DATABASE_URL: process.env.DATABASE_URL || readEnv('DATABASE_URL') },
});
process.exit(res.status ?? 1);
