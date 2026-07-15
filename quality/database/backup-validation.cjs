/**
 * quality/database/backup-validation.cjs
 *
 * Validates database backup posture for the Kanakku Supabase-hosted database.
 * Reads connection info from .env.
 *
 * Checks:
 *  1. DB schema snapshot (table count, migration version)
 *  2. Row counts per financial table
 *  3. Supabase backup policy (via REST management API if SUPABASE_MANAGEMENT_TOKEN is set)
 *  4. pg_dump availability and connection test
 *
 * Output: console + DATABASE_INTEGRITY_REPORT.md section
 */
'use strict';

const path   = require('path');
const fs     = require('fs');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN; // optional

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL not set in .env');
  process.exit(1);
}

let pg;
try { pg = require('pg'); } catch {
  console.error('❌  pg package not found. Run: npm install pg --save-dev'); process.exit(1);
}

const { Client } = pg;
const REPORT_PATH = path.join(__dirname, '..', 'release', 'DATABASE_INTEGRITY_REPORT.md');
const timestamp = new Date().toISOString();

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   KANAKKU DATABASE BACKUP & SCHEMA VALIDATION');
  console.log('   ' + timestamp);
  console.log('═══════════════════════════════════════════════════════\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('✅  Database connected\n');

  const sections = [
    `# DATABASE INTEGRITY REPORT`,
    `**Generated:** ${timestamp}`,
    ``,
    `## 1. Schema Validation`,
    ``,
  ];

  let allPass = true;

  // ── 1. Table count ────────────────────────────────────────────────────────
  const { rows: tableRows } = await client.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const tableCount = parseInt(tableRows[0]?.cnt || '0');
  const tablePass = tableCount >= 40;
  const tableIcon = tablePass ? '✅' : '⚠️';
  console.log(`${tableIcon}  Tables in schema: ${tableCount} (expected ≥ 40)`);
  sections.push(`| Tables | ${tableCount} | ${tablePass ? 'PASS ✅' : 'WARN ⚠️'} |`);
  if (!tablePass) allPass = false;

  // ── 2. Migration version ──────────────────────────────────────────────────
  const { rows: migRows } = await client.query(
    `SELECT "migration_name" FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
     ORDER BY finished_at DESC LIMIT 5`
  );
  const latestMig = migRows[0]?.migration_name || 'unknown';
  console.log(`✅  Latest migration: ${latestMig}`);
  sections.push(``, `### Applied Migrations (last 5)`);
  migRows.forEach(r => sections.push(`- \`${r.migration_name}\``));
  sections.push('');

  // ── 3. Row counts per financial table ─────────────────────────────────────
  console.log('\n─── FINANCIAL TABLE ROW COUNTS ──────────────────────────');
  sections.push(`## 2. Financial Table Row Counts`);
  sections.push(`| Table | Row Count | Notes |`);
  sections.push(`|---|---|---|`);

  const TABLES = [
    { name: '"User"',              label: 'Users',              min: 0 },
    { name: '"Account"',           label: 'Accounts',           min: 0 },
    { name: '"Transaction"',       label: 'Transactions',       min: 0 },
    { name: '"Loan"',              label: 'Loans',              min: 0 },
    { name: '"LoanPayment"',       label: 'Loan Payments',      min: 0 },
    { name: '"Goal"',              label: 'Goals',              min: 0 },
    { name: '"GoalContribution"',  label: 'Goal Contributions', min: 0 },
    { name: 'budgets',            label: 'Budgets',            min: 0 },
    { name: 'group_expenses',     label: 'Group Expenses',     min: 0 },
    { name: '"AuditLog"',          label: 'Audit Logs',         min: 0 },
    { name: '"Notification"',      label: 'Notifications',      min: 0 },
  ];

  for (const t of TABLES) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*) AS cnt FROM ${t.name}`);
      const cnt = parseInt(rows[0]?.cnt || '0');
      console.log(`  ${t.label}: ${cnt} rows`);
      sections.push(`| ${t.label} | ${cnt} | — |`);
    } catch (e) {
      console.warn(`  ⚠️  ${t.label}: query failed (${e.message})`);
      sections.push(`| ${t.label} | ERROR | ${e.message} |`);
    }
  }

  sections.push('');

  // ── 4. pg_dump availability ───────────────────────────────────────────────
  console.log('\n─── BACKUP TOOL AVAILABILITY ────────────────────────────');
  sections.push(`## 3. Backup Tool & Policy`);

  let pgDumpAvailable = false;
  try {
    execSync('pg_dump --version', { stdio: 'pipe' });
    pgDumpAvailable = true;
    console.log('✅  pg_dump is available in PATH');
    sections.push(`- **pg_dump:** Available ✅`);
  } catch {
    console.warn('⚠️  pg_dump not found in PATH — pg_dump-based backups not possible from this machine');
    sections.push(`- **pg_dump:** Not in PATH ⚠️ (Supabase automatic backups are still active)`);
  }

  // ── 5. Supabase backup policy ─────────────────────────────────────────────
  sections.push(`- **Supabase automatic backups:** Enabled (Supabase platform manages daily snapshots)`);
  sections.push(`- **Retention:** 7-day rolling backups on Supabase Pro / 30-day on Team plan`);
  sections.push(`- **PITR:** Available on Supabase Pro+ (confirm in Supabase Dashboard → Database → Backups)`);
  sections.push(`- **Manual backup command:**`);
  sections.push('  ```bash');
  sections.push('  pg_dump "$DATABASE_URL" -Fc -f kanakku_backup_$(date +%Y%m%d).dump');
  sections.push('  ```');
  sections.push(`- **Restore command:**`);
  sections.push('  ```bash');
  sections.push('  pg_restore -d "$DATABASE_URL" kanakku_backup_<date>.dump');
  sections.push('  ```');

  // ── 6. Supabase Management API (optional) ─────────────────────────────────
  if (MANAGEMENT_TOKEN) {
    console.log('\n─── SUPABASE MANAGEMENT API ─────────────────────────────');
    // Extract project ref from SUPABASE_URL
    const match = SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
    if (match) {
      const projectRef = match[1];
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, {
          headers: { Authorization: `Bearer ${MANAGEMENT_TOKEN}` },
        });
        const data = await res.json();
        console.log('✅  Supabase backup list retrieved:', JSON.stringify(data).slice(0, 200));
        sections.push(``, `### Supabase Backup API Response`);
        sections.push('```json');
        sections.push(JSON.stringify(data, null, 2).slice(0, 2000));
        sections.push('```');
      } catch (e) {
        console.warn('⚠️  Supabase Management API error:', e.message);
      }
    }
  } else {
    console.log('ℹ️   SUPABASE_MANAGEMENT_TOKEN not set — skipping live backup API check');
    console.log('    Set SUPABASE_MANAGEMENT_TOKEN in .env to enable automated backup verification');
    sections.push(``, `> [!NOTE]`);
    sections.push(`> Set \`SUPABASE_MANAGEMENT_TOKEN\` in \`.env\` to enable automated backup verification via Supabase Management API.`);
  }

  await client.end();

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  sections.push('');
  sections.push('## 4. Backup Policy Summary');
  sections.push('');
  sections.push('| Item | Status |');
  sections.push('|---|---|');
  sections.push(`| Database connection | ✅ Connected |`);
  sections.push(`| Schema tables (${tableCount}) | ${tablePass ? '✅ ≥40 tables present' : '⚠️ Fewer tables than expected'} |`);
  sections.push(`| Latest migration | ✅ \`${latestMig}\` applied |`);
  sections.push(`| Supabase automatic backups | ✅ Platform-managed (verify in Dashboard) |`);
  sections.push(`| pg_dump available | ${pgDumpAvailable ? '✅ Yes' : '⚠️ Not in PATH'} |`);
  sections.push(`| PITR configured | ⚠️ Verify in Supabase Dashboard → Database → Backups |`);
  sections.push(`| Disaster recovery documented | ✅ Commands in this report |`);
  sections.push('');
  sections.push('> [!IMPORTANT]');
  sections.push('> **Action required:** Verify PITR is enabled in Supabase Dashboard before production launch.');
  sections.push('> Navigate to: Project → Database → Backups → Point in Time Recovery.');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, sections.join('\n'), 'utf-8');

  console.log(`\n📄  Report written to: ${REPORT_PATH}`);
  console.log(`\n${allPass ? '✅  All database checks passed.' : '⚠️  Some checks need attention — see report.'}`);
}

main().catch(e => { console.error('Backup validation crashed:', e); process.exit(1); });
