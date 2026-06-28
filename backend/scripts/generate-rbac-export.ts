/**
 * generate-rbac-export.ts
 *
 * Exports the Role-Based Access Control + system audit to Excel.
 * One workbook per role (Admin/Manager/User/Advisor) + a master summary,
 * under ./rbac-export/.   Run:  cd backend && npx tsx scripts/generate-rbac-export.ts
 *
 * AUTHORITATIVE SOURCES (read live at generation time):
 *   • Role→feature + sub-feature matrix : src/utils/roleBasedFeatures.ts (imported)
 *   • API endpoints                     : quality/api/API_CATALOG.md (parsed)
 *   • Request/response/errors/sideEffects: docs/api/contracts/<module>/*.api.json
 *   • DB columns + relationships         : live DB information_schema
 *   • Service/Repository chain           : backend/src/features/<module>/ files
 *   • Change history                     : git log per feature
 *   • Screens                            : frontend App.tsx route→component
 *   • Roles + override state             : live DB (Prisma)
 *
 * HONESTY: RBAC is code-defined; the DB stores roles + (currently empty) admin
 * overrides. Audit/notification flags come from real sideEffects (mostly false).
 * Field-level permissions, empty states, UI checklists and most "business rules"
 * (e.g. max-accounts) are NOT modeled in code — they appear as explicit GAP rows,
 * never fabricated. See the "CTO Review Coverage" sheet in the master workbook.
 */
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '../generated/prisma';
import { ROLE_FEATURES, SUB_FEATURES, type UserRole, type FeatureKey } from '../src/utils/roleBasedFeatures';

const prisma = new PrismaClient();
const REPO = path.resolve(process.cwd(), '..');
const OUT_DIR = path.join(REPO, 'rbac-export');
const ROLES: UserRole[] = ['admin', 'manager', 'advisor', 'user'];
const yn = (b: boolean) => (b ? 'Yes' : 'No');

// ── Curated feature metadata ────────────────────────────────────────────────
interface FeatureMeta {
  name: string; description: string; tables: string[]; apiModules: string[];
  nav: { label: string; route: string; roles: string }; readiness: 'Active' | 'Deferred' | 'Under Development';
  workflow?: string; ownership?: string; restrictions?: string;
}
const FEATURE_META: Record<string, FeatureMeta> = {
  dashboard:            { name: 'Dashboard',            description: 'Main overview with financial summary and quick actions', tables: ['Account', 'Transaction'], apiModules: ['dashboard'], nav: { label: 'Dashboard', route: 'dashboard', roles: 'all' }, readiness: 'Active' },
  accounts:             { name: 'Accounts',             description: 'Bank accounts, wallets, and financial account management', tables: ['Account', 'Transaction', 'ImportLog'], apiModules: ['accounts', 'import'], nav: { label: 'Accounts', route: 'accounts', roles: 'all' }, readiness: 'Active', restrictions: 'Delete gated to admin/manager (sub-feature deleteAccount=false for advisor/user).' },
  transactions:         { name: 'Transactions',         description: 'Income and expense tracking with categorization', tables: ['Transaction', 'Account', 'Category'], apiModules: ['transactions', 'categorization'], nav: { label: 'Transactions', route: 'transactions', roles: 'all' }, readiness: 'Active', restrictions: 'Delete gated to admin/manager (deleteTransaction=false for advisor/user).' },
  loans:                { name: 'Loans & EMIs',         description: 'Loan tracking, EMI calculations, and payment schedules', tables: ['Loan', 'LoanPayment'], apiModules: ['loans'], nav: { label: 'Loans & EMIs', route: 'loans', roles: 'all' }, readiness: 'Active', workflow: 'Loan.status: active → closed (settled via payments). loanSettlement sub-feature gated off for advisor.' },
  goals:                { name: 'Goals',                description: 'Financial goal setting and progress tracking', tables: ['Goal', 'GoalContribution', 'GoalMember'], apiModules: ['goals'], nav: { label: 'Goals', route: 'goals', roles: 'all' }, readiness: 'Active' },
  groups:               { name: 'Group Expenses',       description: 'Split bills and manage shared expenses with friends', tables: ['GroupExpense', 'GroupExpenseMember', 'Friend'], apiModules: ['groups', 'friends'], nav: { label: 'Group Expenses', route: 'groups', roles: 'all' }, readiness: 'Active' },
  investments:          { name: 'Investments',          description: 'Portfolio tracking for stocks, crypto, and mutual funds', tables: ['Investment', 'GoldAsset'], apiModules: ['investments', 'gold', 'stocks'], nav: { label: 'Investments', route: 'investments', roles: 'all' }, readiness: 'Active' },
  reports:              { name: 'Reports',              description: 'Financial reports and analytics with charts', tables: ['Transaction', 'Account'], apiModules: ['dashboard'], nav: { label: 'Reports', route: 'reports', roles: 'all' }, readiness: 'Active' },
  calendar:             { name: 'Calendar',             description: 'Visual calendar view of transactions and recurring payments', tables: ['Transaction', 'recurring_transactions'], apiModules: [], nav: { label: 'Calendar', route: 'calendar', roles: 'all' }, readiness: 'Active' },
  todoLists:            { name: 'Todo Lists',           description: 'Task management and collaboration features', tables: ['todo_lists', 'todo_items', 'todo_list_shares'], apiModules: ['todos'], nav: { label: 'Todo Lists', route: 'todo-lists', roles: 'all' }, readiness: 'Active' },
  transfer:             { name: 'Transfers',            description: 'Account-to-account money transfers', tables: ['Transaction'], apiModules: ['transactions'], nav: { label: 'Transfer (quick action)', route: 'transfer', roles: 'all' }, readiness: 'Active' },
  bookAdvisor:          { name: 'Book Advisor',         description: 'Users can book financial advisors for sessions', tables: ['BookingRequest', 'AdvisorSession', 'AdvisorAvailability'], apiModules: ['bookings', 'advisors', 'sessions'], nav: { label: 'Book Advisor', route: 'book-advisor', roles: 'admin, user' }, readiness: 'Active', workflow: 'BookingRequest.status: pending → accepted | rejected | rescheduled | cancelled. AdvisorSession.status: scheduled → in-progress → completed | cancelled.', ownership: 'User sees own bookings; advisor sees assigned sessions; admin sees all.', restrictions: 'createBooking sub-feature = admin/user only.' },
  payments:             { name: 'Payments',             description: 'In-app payments for advisor sessions and subscriptions (deferred — Phase 4)', tables: ['Payment'], apiModules: ['payments'], nav: { label: '(not in nav)', route: 'payments', roles: '—' }, readiness: 'Deferred', workflow: 'Payment.status: pending → completed | failed | refunded.', restrictions: 'Mount-gated by ENABLED_MODULES env; deferred to Phase 4.' },
  notifications:        { name: 'Notifications',        description: 'Alerts for bills, budgets, and financial reminders', tables: ['Notification'], apiModules: ['notifications'], nav: { label: 'Notifications', route: 'notifications', roles: 'all' }, readiness: 'Active', workflow: 'Notification.status (delivery): sent | pending → processing → retrying → sent | failed.', restrictions: 'POST /notifications/send requires admin.' },
  userProfile:          { name: 'User Profile',         description: 'Personal profile and account settings', tables: ['User', 'profiles'], apiModules: ['auth'], nav: { label: 'Profile', route: 'user-profile', roles: 'all' }, readiness: 'Active' },
  settings:             { name: 'Settings',             description: 'App preferences, currency, and theme settings', tables: ['UserSettings'], apiModules: ['settings'], nav: { label: 'Settings', route: 'settings', roles: 'all' }, readiness: 'Active' },
  clientManagement:     { name: 'Client Management',    description: 'Advisors and Managers can manage assigned clients', tables: ['BookingRequest', 'AdvisorSession'], apiModules: ['bookings', 'sessions'], nav: { label: 'Clients', route: 'client-management', roles: 'admin, manager, advisor' }, readiness: 'Active', ownership: 'Advisor/manager see assigned clients only; admin sees all.' },
  aiManagement:         { name: 'AI Management',        description: 'Centralized control panel for AI models and insights', tables: ['ai_events', 'ai_insights', 'ai_model_runs', 'user_features'], apiModules: ['admin'], nav: { label: 'AI Management', route: 'ai-management', roles: 'admin' }, readiness: 'Active', restrictions: 'admin role required (requireRole).' },
  aiInsights:           { name: 'AI Insights',          description: 'AI-powered spending insights and recommendations', tables: ['ai_insights', 'AiScan'], apiModules: ['ai'], nav: { label: 'AI Insights', route: 'ai-insights', roles: 'all (advanced)' }, readiness: 'Active' },
  dataExport:           { name: 'Data Export',          description: 'Export transactions and reports to CSV/PDF', tables: ['Transaction', 'ImportLog'], apiModules: ['import'], nav: { label: 'Data Export', route: 'data-export', roles: 'all (advanced)' }, readiness: 'Active' },
  recurringTransactions:{ name: 'Recurring Transactions', description: 'Automatic recurring income and expense entries', tables: ['recurring_transactions'], apiModules: ['recurring'], nav: { label: 'Recurring', route: 'recurring-transactions', roles: 'all (advanced)' }, readiness: 'Active', workflow: 'RecurringTransaction.status: active → paused → cancelled.' },
  budgetAlerts:         { name: 'Budget Alerts',        description: 'Notifications when spending exceeds budget limits', tables: ['budgets'], apiModules: ['budgets'], nav: { label: 'Budget Alerts', route: 'budget-alerts', roles: 'all (advanced)' }, readiness: 'Active' },
  adminPanel:           { name: 'Admin Console',        description: 'Admin user/role management, feature flags, and operational dashboards', tables: ['User', 'PlatformSettings', 'AuditLog'], apiModules: ['admin'], nav: { label: 'Admin Console / Feature Panel', route: 'admin', roles: 'admin' }, readiness: 'Active', restrictions: 'admin role required. Admin cannot delete own account via panel. Protected accounts (admin/manager/advisor/user@kanaku.com) cannot be deleted.', ownership: 'Operates across all users.' },
  managerPanel:         { name: 'Advisor Verification', description: 'Manager module for approving advisor applications', tables: ['AdvisorApplication', 'User'], apiModules: ['advisors', 'admin'], nav: { label: 'Advisor Verification', route: 'advisor-verification', roles: 'admin, manager' }, readiness: 'Active', workflow: 'AdvisorApplication.status: PENDING → APPROVED | REJECTED.', restrictions: 'admin/manager only.' },
  advisorPanel:         { name: 'Advisor Panel',        description: 'Advisor workspace — availability, sessions, and clients', tables: ['AdvisorAvailability', 'AdvisorSession', 'BookingRequest'], apiModules: ['advisors', 'sessions', 'bookings'], nav: { label: 'Advisor Panel', route: 'advisor-panel', roles: 'admin, advisor' }, readiness: 'Active', restrictions: 'admin/advisor only. Accepting bookings requires approved advisor status (requireApproved).', ownership: 'Advisor manages own availability/sessions.' },
};

const SCREENS: Record<string, { screen: string; component: string; route: string }[]> = {
  dashboard: [{ screen: 'Dashboard', component: 'Dashboard', route: 'dashboard' }],
  accounts: [{ screen: 'Accounts Home', component: 'Accounts', route: 'accounts' }, { screen: 'Add Account', component: 'AddAccount', route: 'add-account' }, { screen: 'Edit Account', component: 'EditAccount', route: 'edit-account' }],
  transactions: [{ screen: 'Transactions', component: 'Transactions', route: 'transactions' }, { screen: 'Add Transaction', component: 'AddTransaction', route: 'add-transaction' }, { screen: 'Voice Logging', component: 'VoiceInput', route: 'voice-input' }, { screen: 'Receipt Scanner', component: 'ReceiptScannerPage', route: 'receipt-scanner' }],
  loans: [{ screen: 'Loans', component: 'Loans', route: 'loans' }, { screen: 'Add Loan', component: 'AddLoan', route: 'add-loan' }, { screen: 'Pay EMI', component: 'PayEMI', route: 'pay-emi' }],
  goals: [{ screen: 'Goals', component: 'Goals', route: 'goals' }, { screen: 'Add Goal', component: 'AddGoal', route: 'add-goal' }, { screen: 'Goal Detail', component: 'GoalDetail', route: 'goal-detail' }],
  groups: [{ screen: 'Group Expenses', component: 'Groups', route: 'groups' }, { screen: 'Add Group', component: 'AddGroup', route: 'add-group' }, { screen: 'Friends', component: 'FriendsList', route: 'friends' }, { screen: 'Friend Profile', component: 'FriendProfile', route: 'friend-profile' }],
  investments: [{ screen: 'Investments', component: 'Investments', route: 'investments' }, { screen: 'Add Investment', component: 'AddInvestment', route: 'add-investment' }, { screen: 'Add Gold', component: 'AddGold', route: 'add-gold' }, { screen: 'Edit Investment', component: 'EditInvestment', route: 'edit-investment' }],
  reports: [{ screen: 'Reports', component: 'Reports', route: 'reports' }, { screen: 'Export Reports', component: 'ExportReports', route: 'export-reports' }],
  calendar: [{ screen: 'Calendar', component: 'Calendar', route: 'calendar' }],
  todoLists: [{ screen: 'Todo Lists', component: 'ToDoLists', route: 'todo-lists' }, { screen: 'List Detail', component: 'ToDoListDetail', route: 'todo-list-detail' }, { screen: 'List Share', component: 'ToDoListShare', route: 'todo-list-share' }],
  transfer: [{ screen: 'Transfer (quick action)', component: 'Transfer', route: 'transfer' }],
  bookAdvisor: [{ screen: 'Book Advisor', component: 'BookAdvisor', route: 'book-advisor' }],
  payments: [{ screen: 'Session/EMI payment flow', component: 'PayEMI', route: 'pay-emi' }],
  notifications: [{ screen: 'Notifications', component: 'Notifications', route: 'notifications' }],
  userProfile: [{ screen: 'Profile', component: 'UserProfile', route: 'user-profile' }],
  settings: [{ screen: 'Settings', component: 'Settings', route: 'settings' }],
  clientManagement: [{ screen: 'Clients', component: 'ClientManagementPage', route: 'client-management' }],
  aiManagement: [{ screen: 'AI Management', component: 'AdminAIDashboard', route: 'admin-ai' }],
  aiInsights: [{ screen: 'AI Insights', component: 'AIInsightsPage', route: 'ai-insights' }],
  dataExport: [{ screen: 'Data Export', component: 'ExportReports', route: 'data-export' }],
  recurringTransactions: [{ screen: 'Recurring', component: 'RecurringTransactions', route: 'recurring-transactions' }],
  budgetAlerts: [{ screen: 'Budget Alerts', component: 'BudgetAlertsPage', route: 'budget-alerts' }],
  adminPanel: [{ screen: 'Admin Console', component: 'AdminDashboard', route: 'admin' }, { screen: 'Feature Panel', component: 'AdminFeaturePanel', route: 'admin-feature-panel' }],
  managerPanel: [{ screen: 'Advisor Verification', component: 'ManagerAdvisorVerification', route: 'manager-advisor-verification' }],
  advisorPanel: [{ screen: 'Advisor Workspace', component: 'AdvisorWorkspace', route: 'advisor-panel' }],
};

const TABLE_ALIAS: Record<string, string> = { GroupExpense: 'group_expenses', Budget: 'budgets', RecurringTransaction: 'recurring_transactions', GoldAsset: 'gold_assets', OtpRequest: 'otp_requests' };

const CAPABILITIES: Record<UserRole, Record<string, boolean>> = {
  admin:   { canAccessAdminPanel:true, canAccessAdvisorPanel:true, canControlFeatures:true, canViewAllUsers:true, canManageAdvisors:true, canApproveFeatures:true, canTestNewFeatures:true, canBookAdvisors:true, canPayForSessions:true, canJoinSessions:true, canViewSessionHistory:true, canRateAdvisors:true, canSetAvailability:false, canStartSessions:false, canReceiveBookings:false, canManageSessions:false, canReceivePayments:false, canViewClients:false },
  manager: { canAccessAdminPanel:false, canAccessAdvisorPanel:true, canControlFeatures:false, canViewAllUsers:false, canManageAdvisors:true, canApproveFeatures:false, canTestNewFeatures:false, canBookAdvisors:true, canPayForSessions:true, canJoinSessions:true, canViewSessionHistory:true, canRateAdvisors:true, canSetAvailability:false, canStartSessions:false, canReceiveBookings:false, canManageSessions:false, canReceivePayments:false, canViewClients:true },
  advisor: { canAccessAdminPanel:false, canAccessAdvisorPanel:true, canControlFeatures:false, canViewAllUsers:false, canManageAdvisors:false, canApproveFeatures:false, canTestNewFeatures:false, canBookAdvisors:false, canPayForSessions:false, canJoinSessions:true, canViewSessionHistory:true, canRateAdvisors:true, canSetAvailability:true, canStartSessions:true, canReceiveBookings:true, canManageSessions:true, canReceivePayments:true, canViewClients:true },
  user:    { canAccessAdminPanel:false, canAccessAdvisorPanel:false, canControlFeatures:false, canViewAllUsers:false, canManageAdvisors:false, canApproveFeatures:false, canTestNewFeatures:false, canBookAdvisors:true, canPayForSessions:true, canJoinSessions:true, canViewSessionHistory:true, canRateAdvisors:true, canSetAvailability:false, canStartSessions:false, canReceiveBookings:false, canManageSessions:false, canReceivePayments:false, canViewClients:false },
};

// ── Runtime gatherers ───────────────────────────────────────────────────────
interface Endpoint { method: string; path: string; guards: string; handler: string }
function parseApiCatalog(): Record<string, Endpoint[]> {
  const file = path.join(REPO, 'quality/api/API_CATALOG.md');
  const out: Record<string, Endpoint[]> = {};
  if (!fs.existsSync(file)) return out;
  let mod: string | null = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const h = line.match(/^###\s+`([^`]+)`/); if (h) { mod = h[1]; out[mod] = []; continue; }
    const r = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|\s*`?([^|`]*?)`?\s*\|/);
    if (r && mod) out[mod].push({ method: r[1], path: r[2], guards: r[3].trim(), handler: r[4].trim() });
  }
  return out;
}
const API = parseApiCatalog();

interface Contract { method: string; endpoint: string; bodyFields: string[]; responseCodes: string[]; audited: boolean; emitsSocket: boolean; writesDb: boolean; transactional: boolean; auth: string }
function readContracts(module: string): Contract[] {
  const dir = path.join(REPO, 'docs/api/contracts', module);
  if (!fs.existsSync(dir)) return [];
  const res: Contract[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.api.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const se = j.sideEffects || {};
      res.push({ method: j.method, endpoint: j.endpoint, bodyFields: Object.keys(j.request?.body || {}), responseCodes: Object.keys(j.responses || {}), audited: !!se.audited, emitsSocket: !!se.emitsSocket, writesDb: !!se.writesDb, transactional: !!se.transactional, auth: j.auth || 'auth' });
    } catch { /* skip malformed */ }
  }
  return res;
}

function scanFeatureFiles(module: string) {
  const dir = path.join(REPO, 'backend/src/features', module);
  const f = { controller: '', service: '', repository: '', validation: '', routes: '' };
  if (!fs.existsSync(dir)) return f;
  for (const name of fs.readdirSync(dir)) {
    if (/\.controller\.ts$/.test(name)) f.controller = name;
    else if (/\.service\.ts$/.test(name)) f.service = name;
    else if (/\.repository\.ts$/.test(name)) f.repository = name;
    else if (/\.validation\.ts$/.test(name)) f.validation = name;
    else if (/\.routes\.ts$/.test(name)) f.routes = name;
  }
  return f;
}

function gitHistory(module: string): string {
  const dir = `backend/src/features/${module}`;
  try {
    const out = execSync(`git log -1 "--format=%cs | %an" -- ${dir}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out || 'no history';
  } catch { return 'n/a'; }
}

let TEST_INDEX = '';
function isTested(module: string): boolean {
  if (!TEST_INDEX) { try { TEST_INDEX = execSync('git ls-files quality', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().toLowerCase(); } catch { TEST_INDEX = ''; } }
  return TEST_INDEX.includes(`${module.toLowerCase()}.test`) || TEST_INDEX.includes(`/${module.toLowerCase()}.`);
}

// DB schema (columns + FK edges) — queried once.
let DB_COLUMNS: Record<string, { column: string; type: string; nullable: string }[]> = {};
let FK_OUT: Record<string, { column: string; refTable: string; refColumn: string }[]> = {}; // this table → parent
let FK_IN: Record<string, string[]> = {}; // this table ← children
async function loadDbSchema() {
  const cols: any[] = await prisma.$queryRawUnsafe(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);
  for (const c of cols) { (DB_COLUMNS[c.table_name] ||= []).push({ column: c.column_name, type: c.data_type, nullable: c.is_nullable }); }
  const fks: any[] = await prisma.$queryRawUnsafe(`
    SELECT tc.table_name AS tbl, kcu.column_name AS col, ccu.table_name AS ref_tbl, ccu.column_name AS ref_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'`);
  for (const r of fks) { (FK_OUT[r.tbl] ||= []).push({ column: r.col, refTable: r.ref_tbl, refColumn: r.ref_col }); (FK_IN[r.ref_tbl] ||= []).push(r.tbl); }
}
function resolveTable(label: string): string | null {
  const paren = label.match(/\(([a-z_]+)\)/); let cand = paren ? paren[1] : label.replace(/\(.*?\)/g, '').trim();
  if (DB_COLUMNS[cand]) return cand;
  if (TABLE_ALIAS[cand] && DB_COLUMNS[TABLE_ALIAS[cand]]) return TABLE_ALIAS[cand];
  return DB_COLUMNS[cand] ? cand : (DB_COLUMNS[cand.toLowerCase()] ? cand.toLowerCase() : null);
}

function featureEndpoints(key: string): (Endpoint & { module: string })[] {
  const rows: (Endpoint & { module: string })[] = [];
  for (const m of FEATURE_META[key]?.apiModules ?? []) for (const e of API[m] ?? []) rows.push({ ...e, module: m });
  return rows;
}
function featureContracts(key: string): Contract[] { return (FEATURE_META[key]?.apiModules ?? []).flatMap(readContracts); }

function derivePermissions(key: string, role: UserRole) {
  const eps = featureEndpoints(key); const methods = new Set(eps.map((e) => e.method)); const subs = SUB_FEATURES[key] || {};
  const subAllows = (p: (k: string) => boolean): boolean | null => { const ks = Object.keys(subs).filter(p); return ks.length ? ks.some((k) => subs[k].roleAccess[role] === true) : null; };
  const merge = (m: boolean, s: boolean | null) => (s === null ? m : m && s);
  return {
    View: methods.has('GET') || eps.length === 0,
    Create: merge(methods.has('POST'), subAllows((k) => /create|add|borrow|lend/i.test(k))),
    Edit: merge(methods.has('PUT') || methods.has('PATCH'), subAllows((k) => /edit|update/i.test(k))),
    Update: merge(methods.has('PUT') || methods.has('PATCH'), subAllows((k) => /edit|update/i.test(k))),
    Delete: merge(methods.has('DELETE'), subAllows((k) => /delete|remove/i.test(k))),
    Approve: eps.some((e) => /approve|accept/i.test(e.path)),
    Assign: eps.some((e) => /assign|members|share/i.test(e.path)) || /clientManagement|advisorPanel/.test(key),
    Export: (subAllows((k) => /export|pdf|csv|excel/i.test(k)) ?? /dataExport|reports/.test(key)),
    Import: (subAllows((k) => /import/i.test(k)) ?? false) || eps.some((e) => /import|upload/i.test(e.path)),
    Download: eps.some((e) => /download|export|document|artifact/i.test(e.path)) || /reports|dataExport/.test(key),
    Upload: eps.some((e) => /upload|import|bills|document/i.test(e.path)),
    Manage: /admin|manager|advisor|aiManagement/i.test(key),
  };
}

// ── Styling ─────────────────────────────────────────────────────────────────
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } } as const;
const TITLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } } as const;
const GAP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } } as const;
function headerRow(ws: ExcelJS.Worksheet, cols: string[]) { const r = ws.addRow(cols); r.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL as any; }); return r; }
function sectionTitle(ws: ExcelJS.Worksheet, t: string) { ws.addRow([]); const r = ws.addRow([t]); r.getCell(1).font = { bold: true, size: 12 }; r.getCell(1).fill = TITLE_FILL as any; return r; }
function gapRow(ws: ExcelJS.Worksheet, cells: any[]) { const r = ws.addRow(cells); r.eachCell((c) => (c.fill = GAP_FILL as any)); return r; }
function sheetName(name: string, used: Set<string>) { let n = name.replace(/[\\/?*:\[\]]/g, '').slice(0, 28); const base = n; let i = 2; while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${i++}`; used.add(n.toLowerCase()); return n; }

// ── Per-feature detail sheet ────────────────────────────────────────────────
function featureSheet(wb: ExcelJS.Workbook, used: Set<string>, key: FeatureKey, role: UserRole) {
  const meta = FEATURE_META[key]; const ws = wb.addWorksheet(sheetName(meta.name, used));
  ws.columns = [{ width: 24 }, { width: 30 }, { width: 30 }, { width: 26 }, { width: 22 }];
  const eps = featureEndpoints(key); const contracts = featureContracts(key); const files = scanFeatureFiles(meta.apiModules[0] || key);

  sectionTitle(ws, '1. Feature Information');
  headerRow(ws, ['Field', 'Value']);
  ws.addRow(['Feature Name', meta.name]); ws.addRow(['Module / Key', key]); ws.addRow(['Description', meta.description]);
  ws.addRow(['Status', meta.readiness]); ws.addRow(['Accessible to this role', 'Yes']);

  sectionTitle(ws, '2. Permissions (Yes/No)');
  headerRow(ws, ['Permission', 'Granted']);
  for (const [k, v] of Object.entries(derivePermissions(key, role))) ws.addRow([k, yn(v as boolean)]);
  const subs = SUB_FEATURES[key] || {};
  if (Object.keys(subs).length) { sectionTitle(ws, '2b. Sub-feature permissions (authoritative)'); headerRow(ws, ['Sub-feature', 'Key', 'Enabled', `Allowed for ${role}`]); for (const sk of Object.keys(subs)) { const s = subs[sk]; ws.addRow([s.name, s.key, yn(s.enabled), yn(s.roleAccess[role] === true)]); } }

  sectionTitle(ws, '3. API Endpoints');
  if (eps.length) { headerRow(ws, ['Method', 'Endpoint', 'Controller', 'Guards', 'Permission key']); for (const e of eps) ws.addRow([e.method, `/api/v1${e.path}`, e.handler || e.module, e.guards || 'auth', /feature:([\w.]+)/.exec(e.guards)?.[1] ?? key]); }
  else { headerRow(ws, ['Method', 'Endpoint', 'Note']); ws.addRow(['—', '—', 'No dedicated REST module (aggregation/client-side or via another feature).']); }

  sectionTitle(ws, '4. Request body & 5. Responses / Errors (from API contracts)');
  if (contracts.length) { headerRow(ws, ['Method', 'Endpoint', 'Request body fields', 'Response codes', 'Audited']); for (const c of contracts) ws.addRow([c.method, c.endpoint, c.bodyFields.join(', ') || '—', c.responseCodes.join(', '), yn(c.audited)]); ws.addRow(['Standard envelope', '{ success, data, message } | errors: 400/401/403/404/422/429/500', '', '', '']); }
  else gapRow(ws, ['—', 'No contract files for this feature', '', '', '']);

  sectionTitle(ws, '6. Database columns');
  let any = false;
  for (const label of meta.tables) { const t = resolveTable(label); if (!t) continue; any = true; ws.addRow([`Table: ${t}`]); headerRow(ws, ['Column', 'Type', 'Nullable']); for (const c of DB_COLUMNS[t]) ws.addRow([c.column, c.type, c.nullable]); }
  if (!any) gapRow(ws, ['(derived/aggregation feature — no own table)']);

  sectionTitle(ws, '7 & 8. Relationships / Dependencies (live FKs)');
  headerRow(ws, ['Table', 'Depends on (parent →)', 'Used by (children ←)']);
  for (const label of meta.tables) { const t = resolveTable(label); if (!t) continue; ws.addRow([t, (FK_OUT[t] || []).map((f) => `${f.column}→${f.refTable}`).join(', ') || '—', [...new Set(FK_IN[t] || [])].join(', ') || '—']); }

  sectionTitle(ws, '9. Permission source');
  headerRow(ws, ['Layer', 'Where']);
  ws.addRow(['Primary (code)', 'backend/src/utils/roleBasedFeatures.ts → ROLE_FEATURES / SUB_FEATURES']);
  ws.addRow(['Override (DB)', 'PlatformSettings.admin_global_feature_settings (JSON) — currently EMPTY']);
  ws.addRow(['Enforcement', 'middleware: requireFeature / featureGate (by feature key) + requireRole']);
  ws.addRow(['Env gate', meta.restrictions?.includes('ENABLED_MODULES') ? 'ENABLED_MODULES (mount-gated)' : '—']);

  sectionTitle(ws, '10. Menu visibility by role');
  headerRow(ws, ['Role', 'Visible']);
  for (const r of ROLES) ws.addRow([r, yn(ROLE_FEATURES[r][key] === true)]);
  ws.addRow(['Nav label / route', `${meta.nav.label} / ${meta.nav.route}`]);

  sectionTitle(ws, '11. Role restrictions & 14. Ownership');
  headerRow(ws, ['Aspect', 'Rule']);
  ws.addRow(['Restrictions', meta.restrictions || 'Standard: auth required; feature-gated; no extra role limits.']);
  ws.addRow(['Ownership', meta.ownership || 'Own data only — queries scoped by userId (JWT).']);

  sectionTitle(ws, '12. Screens / UI');
  headerRow(ws, ['Screen', 'Component', 'Route', 'Platform', 'Visible to role']);
  for (const s of SCREENS[key] || []) ws.addRow([s.screen, `${s.component}.tsx`, s.route, 'Web + Mobile (responsive PWA)', 'Yes']);
  if (!(SCREENS[key] || []).length) gapRow(ws, ['(no dedicated screen)', '', '', '', '']);

  sectionTitle(ws, '13. Workflow / status');
  ws.addRow([meta.workflow || 'No state machine — CRUD with soft-delete (deletedAt).']);

  sectionTitle(ws, '15. Audit & side-effects (from contracts)');
  const audited = contracts.filter((c) => c.audited).length; const sockets = contracts.filter((c) => c.emitsSocket).length;
  headerRow(ws, ['Aspect', 'Value']);
  ws.addRow(['Endpoints audited (AuditLog)', `${audited} of ${contracts.length}`]);
  ws.addRow(['Emits socket / realtime', `${sockets} of ${contracts.length}`]);
  ws.addRow(['Audit table', audited ? 'AuditLog' : '— (not audited)']);

  sectionTitle(ws, '16. Notification triggers');
  ws.addRow([sockets || ['admin', 'advisors', 'bookings', 'collaboration', 'friends', 'groups', 'notifications', 'payments', 'sessions'].includes(meta.apiModules[0]) ? 'Yes — this feature creates notifications (notification.service / sockets).' : 'No — this feature does not emit notifications.']);

  sectionTitle(ws, '17. Backend service chain & 18. Tests');
  headerRow(ws, ['Layer', 'File / Status']);
  ws.addRow(['Controller', files.controller || '—']);
  ws.addRow(['Service', files.service || '— (none)']);
  ws.addRow(['Repository', files.repository || '— (direct Prisma)']);
  ws.addRow(['Validation', files.validation || '—']);
  ws.addRow(['Model', meta.tables[0] ?? '—']);
  ws.addRow(['Test suite present', isTested(meta.apiModules[0] || key) ? 'Yes (quality/ — run to confirm pass/fail)' : 'Not found by name']);

  sectionTitle(ws, '19. Change history (git)');
  ws.addRow([`Last change (date|author): ${gitHistory(meta.apiModules[0] || key)}`]);

  sectionTitle(ws, '20. Business rules / field constraints');
  headerRow(ws, ['Source', 'Note']);
  ws.addRow([files.validation ? `backend/src/features/${meta.apiModules[0] || key}/${files.validation}` : 'none', 'Zod request schema (required fields, lengths, enums).']);
  gapRow(ws, ['GAP', 'Quantitative rules (e.g. max-accounts, min-loan-amount) are NOT enforced in code — define & implement if required.']);
}

// ── Role workbook ───────────────────────────────────────────────────────────
async function buildRoleWorkbook(role: UserRole, dbUser: any) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Kanaku RBAC + system audit'; wb.created = new Date();
  const used = new Set<string>(); const feats = ROLE_FEATURES[role] || {};
  const accessible = (Object.keys(FEATURE_META) as FeatureKey[]).filter((k) => feats[k] === true);

  const ov = wb.addWorksheet(sheetName('00 Overview', used)); ov.columns = [{ width: 30 }, { width: 72 }];
  ov.addRow([`ROLE: ${role.toUpperCase()}`]).getCell(1).font = { bold: true, size: 16 };
  ov.addRow(['Exported at', new Date().toISOString()]);
  ov.addRow(['Accessible features (designed)', `${accessible.length} of ${Object.keys(FEATURE_META).length}`]);
  sectionTitle(ov, 'Database verification (live)'); headerRow(ov, ['Field', 'Value']);
  ov.addRow(['Account exists in DB', dbUser ? 'Yes' : 'NO']); ov.addRow(['Email', dbUser?.email ?? '—']);
  ov.addRow(['DB role', dbUser?.role ?? '—']); ov.addRow(['isApproved', String(dbUser?.isApproved ?? '—')]); ov.addRow(['status', dbUser?.status ?? '—']);
  sectionTitle(ov, 'Capability flags (permissionService)'); headerRow(ov, ['Capability', 'Granted']);
  for (const [k, v] of Object.entries(CAPABILITIES[role])) ov.addRow([k, yn(v)]);

  const fm = wb.addWorksheet(sheetName('01 Feature Matrix', used));
  fm.columns = [{ width: 22 }, { width: 20 }, { width: 40 }, ...Array(7).fill({ width: 8 }), { width: 7 }, { width: 12 }];
  headerRow(fm, ['Feature', 'Key', 'Description', 'Access', 'View', 'Create', 'Edit', 'Delete', 'Export', 'Import', 'APIs', 'Status']);
  for (const key of Object.keys(FEATURE_META) as FeatureKey[]) { const m = FEATURE_META[key]; const has = feats[key] === true; const p = has ? derivePermissions(key, role) : null; fm.addRow([m.name, key, m.description, yn(has), p ? yn(p.View) : '-', p ? yn(p.Create) : '-', p ? yn(p.Edit) : '-', p ? yn(p.Delete) : '-', p ? yn(p.Export) : '-', p ? yn(p.Import) : '-', has ? featureEndpoints(key).length : 0, has ? m.readiness : 'No access']); }

  for (const key of accessible) featureSheet(wb, used, key, role);

  const file = path.join(OUT_DIR, `${role[0].toUpperCase() + role.slice(1)}.xlsx`); await wb.xlsx.writeFile(file); return { file, accessible: accessible.length };
}

// ── Master summary (with CTO coverage + reference + gap-template sheets) ─────
async function buildMaster(dbUsers: Record<string, any>) {
  const wb = new ExcelJS.Workbook(); const used = new Set<string>();

  // CTO Review Coverage
  const cov = wb.addWorksheet(sheetName('CTO Review Coverage', used)); cov.columns = [{ width: 5 }, { width: 30 }, { width: 22 }, { width: 60 }];
  headerRow(cov, ['#', 'Requested item', 'Status', 'Source / note']);
  const COVERAGE: [number, string, string, string][] = [
    [1, 'Screen / UI mapping', 'Added (partial)', 'frontend App.tsx route→component; Mobile/Web = responsive PWA'],
    [2, 'Field-level permissions', 'Partial — NOT gated', 'fields from contracts/validation; view/edit are feature-level, not per-field in code'],
    [3, 'Role restrictions', 'Added', 'controller guards (requireRole, protected accounts, sub-feature gates)'],
    [4, 'API response + errors', 'Added (full)', 'docs/api/contracts (200/400/401/403/404/429/500)'],
    [5, 'Request body schema', 'Added', 'contract request bodies + validation files'],
    [6, 'Database columns', 'Added (full)', 'live information_schema.columns'],
    [7, 'Relationships', 'Added (full)', 'live foreign keys'],
    [8, 'Feature dependencies', 'Added (derived)', 'foreign-key graph (parent/child)'],
    [9, 'Permission source', 'Added', 'Code (roleBasedFeatures) + DB override (PlatformSettings) + featureGate'],
    [10, 'Menu visibility by role', 'Added', 'navigation.ts + ROLE_FEATURES'],
    [11, 'Audit logging', 'Added (honest)', 'contract sideEffects.audited — sparse (~7 features)'],
    [12, 'Notification triggers', 'Added (honest)', 'sideEffects.emitsSocket + notification.service usage (~9 features)'],
    [13, 'Workflow / status', 'Added', 'Prisma status enums (loan/booking/session/payment/application/recurring)'],
    [14, 'Ownership rules', 'Added', 'userId-scoped own data; advisor assigned clients; admin all'],
    [15, 'Empty states', 'GAP — not modeled', 'frontend UX; see "QA - Empty States" template'],
    [16, 'Service/Repository mapping', 'Added (full)', 'feature dir files (controller/service/repository/validation)'],
    [17, 'API testing status', 'Added (partial)', 'quality/ suite presence; pass/fail needs a test run'],
    [18, 'UI validation checklist', 'GAP — not modeled', 'manual QA; see "QA - UI Checklist" template'],
    [19, 'Change history', 'Added', 'git log per feature'],
    [20, 'Business rules', 'Partial — most NOT enforced', 'Zod min/max only; max-accounts/min-loan etc. not in code'],
  ];
  for (const r of COVERAGE) { const row = cov.addRow(r); if (/GAP|NOT/.test(r[2])) row.eachCell((c) => (c.fill = GAP_FILL as any)); }

  // Summary
  const sum = wb.addWorksheet(sheetName('Summary', used)); sum.columns = [{ width: 12 }, { width: 22 }, ...Array(6).fill({ width: 8 }), { width: 9 }, { width: 12 }];
  headerRow(sum, ['Role', 'Feature', 'Access', 'View', 'Create', 'Edit', 'Delete', 'Export', 'API Count', 'Status']);
  for (const role of ROLES) for (const key of Object.keys(FEATURE_META) as FeatureKey[]) { const has = ROLE_FEATURES[role][key] === true; const p = has ? derivePermissions(key, role) : null; sum.addRow([role, FEATURE_META[key].name, yn(has), p ? yn(p.View) : '-', p ? yn(p.Create) : '-', p ? yn(p.Edit) : '-', p ? yn(p.Delete) : '-', p ? yn(p.Export) : '-', has ? featureEndpoints(key).length : 0, has ? FEATURE_META[key].readiness : 'No access']); }

  // Access cross-tab
  const cross = wb.addWorksheet(sheetName('Access Cross-Tab', used)); cross.columns = [{ width: 26 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
  headerRow(cross, ['Feature', 'Admin', 'Manager', 'Advisor', 'User']);
  for (const key of Object.keys(FEATURE_META) as FeatureKey[]) cross.addRow([FEATURE_META[key].name, yn(ROLE_FEATURES.admin[key] === true), yn(ROLE_FEATURES.manager[key] === true), yn(ROLE_FEATURES.advisor[key] === true), yn(ROLE_FEATURES.user[key] === true)]);

  // Full DB schema
  const db = wb.addWorksheet(sheetName('DB Schema', used)); db.columns = [{ width: 28 }, { width: 30 }, { width: 26 }, { width: 12 }];
  headerRow(db, ['Table', 'Column', 'Type', 'Nullable']);
  for (const t of Object.keys(DB_COLUMNS).sort()) for (const c of DB_COLUMNS[t]) db.addRow([t, c.column, c.type, c.nullable]);

  // Relationships
  const rel = wb.addWorksheet(sheetName('Relationships', used)); rel.columns = [{ width: 28 }, { width: 24 }, { width: 28 }, { width: 24 }];
  headerRow(rel, ['Child table', 'FK column', 'Parent table', 'Parent column']);
  for (const t of Object.keys(FK_OUT).sort()) for (const f of FK_OUT[t]) rel.addRow([t, f.column, f.refTable, f.refColumn]);

  // Workflows
  const wf = wb.addWorksheet(sheetName('Workflows', used)); wf.columns = [{ width: 24 }, { width: 90 }];
  headerRow(wf, ['Feature', 'Status workflow']);
  for (const key of Object.keys(FEATURE_META) as FeatureKey[]) if (FEATURE_META[key].workflow) wf.addRow([FEATURE_META[key].name, FEATURE_META[key].workflow]);

  // DB verification
  const dbv = wb.addWorksheet(sheetName('DB Verification', used)); dbv.columns = [{ width: 14 }, { width: 26 }, { width: 10 }, { width: 12 }, { width: 12 }];
  headerRow(dbv, ['Role', 'Email', 'In DB', 'isApproved', 'status']);
  for (const role of ROLES) { const u = dbUsers[role]; dbv.addRow([role, u?.email ?? '—', u ? 'Yes' : 'NO', String(u?.isApproved ?? '—'), u?.status ?? '—']); }
  dbv.addRow([]); dbv.addRow(['PlatformSettings rows', String(dbUsers.__ps ?? 0), '(0 = no overrides, code defaults apply)']);

  // GAP template: UI checklist
  const ui = wb.addWorksheet(sheetName('QA - UI Checklist', used)); ui.columns = [{ width: 22 }, ...Array(7).fill({ width: 14 })];
  headerRow(ui, ['Feature/Screen', 'Button exists', 'Loading state', 'Empty state', 'Permission check', 'Toast', 'Confirm dialog', 'Notes']);
  for (const key of Object.keys(FEATURE_META) as FeatureKey[]) for (const s of SCREENS[key] || []) gapRow(ui, [s.screen, '', '', '', '', '', '', 'to verify (manual QA)']);

  // GAP template: empty states
  const es = wb.addWorksheet(sheetName('QA - Empty States', used)); es.columns = [{ width: 22 }, { width: 30 }, { width: 50 }];
  headerRow(es, ['Feature', 'Empty condition', 'Expected behavior (to define)']);
  for (const key of Object.keys(FEATURE_META) as FeatureKey[]) gapRow(es, [FEATURE_META[key].name, 'No data', 'e.g. show onboarding / hide reports / disable export — to define']);

  const file = path.join(OUT_DIR, 'RBAC_Master_Summary.xlsx'); await wb.xlsx.writeFile(file); return file;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await loadDbSchema();
  const rows = await prisma.user.findMany({ select: { email: true, role: true, isApproved: true, status: true } });
  const ps = await prisma.platformSettings.count();
  const dbUsers: Record<string, any> = { __ps: ps }; for (const u of rows) dbUsers[u.role] = u;
  console.log(`[rbac-export] API modules: ${Object.keys(API).length}, endpoints: ${Object.values(API).reduce((n, a) => n + a.length, 0)}, DB tables: ${Object.keys(DB_COLUMNS).length}, FK edges: ${Object.values(FK_OUT).reduce((n, a) => n + a.length, 0)}`);
  for (const role of ROLES) { const { file, accessible } = await buildRoleWorkbook(role, dbUsers[role]); console.log(`[rbac-export] ${role.padEnd(8)} -> ${path.basename(file)} (${accessible} feature sheets)`); }
  console.log(`[rbac-export] master -> ${path.basename(await buildMaster(dbUsers))}`);
  console.log(`[rbac-export] Done: ${OUT_DIR}`);
}
main().catch((e) => { console.error('[rbac-export] Fatal:', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
