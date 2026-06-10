import React, { useState, useMemo } from 'react';
import { db } from '@/lib/database';
import { 
 Download, Upload, Trash2, Database, Globe, 
 Bell, ExternalLink, FileText,
 Smartphone, RefreshCw, Coins
} from 'lucide-react';
import { Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { cn } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import {
 downloadDataToFile,
 createBackup,
 listBackups
} from '@/lib/importExport';
import supabase from '@/utils/supabase/client';
import { permissionService } from '@/services/permissionService';
import { ImportDataModal } from '@/app/components/shared/ImportDataModal';
import {
 clearSmsDetectedTransactions,
 describeSmsTransaction,
 disableSmsTransactionDetection,
 enableSmsTransactionDetection,
 getSmsDetectionStatus,
 markSmsTransactionIgnored,
 primeSmsTransactionDraft,
 scanHistoricalSmsTransactions,
 type SmsDetectionStatus,
} from '@/services/smsTransactionDetectionService';
import { runWithCloudSyncSuppressed } from '@/lib/auth-sync-integration';

export const Settings: React.FC = () => {
 const { currency, setCurrency, language, setLanguage, visibleFeatures, setVisibleFeatures, accounts, refreshData, setCurrentPage } = useApp();
 const { user, signOut, role } = useAuth();
 const [showImportModal, setShowImportModal] = useState(false);
 const [backups, setBackups] = useState<Array<any>>([]);
 const [showBackups, setShowBackups] = useState(false);
 const [importHistory, setImportHistory] = useState<Array<any>>([]);
 const [showImportHistory, setShowImportHistory] = useState(false);
 const [isSigningOut, setIsSigningOut] = useState(false);
 const [smsStatus, setSmsStatus] = useState<SmsDetectionStatus>({
 supported: false,
 enabled: false,
 permissionState: 'unavailable',
 historicalScanCompleted: false,
 });
 const [isSmsBusy, setIsSmsBusy] = useState(false);

 const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>(() => {
 try {
 const stored = localStorage.getItem('notificationSettings');
 return stored ? JSON.parse(stored) : {
 transactionAlerts: true,
 budgetAlerts: true,
 loanReminders: true,
 groupExpenseUpdates: true,
 goalProgressAlerts: true,
 appUpdates: true,
 };
 } catch {
 return {
 transactionAlerts: true,
 budgetAlerts: true,
 loanReminders: true,
 groupExpenseUpdates: true,
 goalProgressAlerts: true,
 appUpdates: true,
 };
 }
 });

 const toggleNotif = (key: string) => {
 const updated = { ...notifSettings, [key]: !notifSettings[key] };
 setNotifSettings(updated);
 localStorage.setItem('notificationSettings', JSON.stringify(updated));
 };

 const smsTransactions = useLiveQuery(
 () => db.smsTransactions.orderBy('detectedAt').reverse().limit(12).toArray(),
 [],
 ) ?? [];
 const pendingSmsTransactions = smsTransactions.filter((item) => item.status === 'detected');
 const importedSmsTransactions = smsTransactions.filter((item) => item.status === 'imported');

 React.useEffect(() => {
 loadBackups();
 loadImportHistory();
 void loadSmsStatus();
 }, []);

 const loadSmsStatus = async () => {
 const status = await getSmsDetectionStatus();
 setSmsStatus(status);
 };

 const loadBackups = async () => {
 const backupList = await listBackups();
 setBackups(backupList);
 };

 const loadImportHistory = async () => {
 const history = await db.importHistories.orderBy('createdAt').reverse().limit(8).toArray();
 setImportHistory(history);
 };

 const handleSignOut = async () => {
 if (isSigningOut) return; // Prevent double-clicks

 setIsSigningOut(true);
 console.log(' Starting sign out process...');
 toast.info('Signing out...');

 try {
  // Step 1: Sign out from Supabase (with timeout)
  const signOutPromise = (async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.warn('Supabase global signOut failed, trying local signOut:', error);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    } catch (e) {
      console.warn('Supabase global signOut exception, trying local signOut:', e);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  })();
  const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Sign out timeout')), 5000)
  );

  try {
  await Promise.race([signOutPromise, timeoutPromise]);
  } catch (e) {
  console.warn('Supabase signOut timed out or failed (non-blocking):', e);
  }

 // Step 2: Clear permissions
 try {
 permissionService.clearPermissions();
 } catch (e) {
 console.warn('Permission clear error (non-blocking):', e);
 }

 // Step 3: Clear all storage (PIN & admin settings preserved)
 try {
 const pinBackup = {
 hash: localStorage.getItem('KANAKU_encrypted_key'),
 salt: localStorage.getItem('KANAKU_salt'),
 adminSettings: localStorage.getItem('admin_global_feature_settings'),
 };
 localStorage.clear();
 sessionStorage.clear();
 if (pinBackup.hash) localStorage.setItem('KANAKU_encrypted_key', pinBackup.hash);
 if (pinBackup.salt) localStorage.setItem('KANAKU_salt', pinBackup.salt);
 if (pinBackup.adminSettings) localStorage.setItem('admin_global_feature_settings', pinBackup.adminSettings);
 } catch (e) {
 console.warn('Storage clear error (non-blocking):', e);
 }

 // Step 4: Clear IndexedDB tables (with timeout)
 try {
 await Promise.race([
 Promise.all([
 db.accounts.clear(),
 db.transactions.clear(),
 db.loans.clear(),
 db.goals.clear(),
 db.investments.clear(),
 db.notifications.clear(),
 db.groupExpenses.clear(),
 db.friends.clear(),
 db.smsTransactions.clear(),
 ]),
 new Promise((_, reject) => setTimeout(() => reject(new Error('DB clear timeout')), 3000))
 ]);
 } catch (e) {
 console.warn('DB clear error (non-blocking):', e);
 }

 // Step 5: Delete the database
 try {
 window.indexedDB.deleteDatabase('KANAKUDB');
 } catch (e) {
 console.warn('IndexedDB delete error (non-blocking):', e);
 }

 console.log(' Sign out completed successfully');
 toast.success('Signed out successfully');

 // Step 6: Hard redirect immediately
 window.location.href = window.location.origin + '/login?logged_out=1';

 } catch (error) {
 console.error(' Sign out failed:', error);

 // Force cleanup even on error (PIN & admin settings preserved)
 try {
 const pinBackup = {
 hash: localStorage.getItem('KANAKU_encrypted_key'),
 salt: localStorage.getItem('KANAKU_salt'),
 adminSettings: localStorage.getItem('admin_global_feature_settings'),
 };
 localStorage.clear();
 sessionStorage.clear();
 if (pinBackup.hash) localStorage.setItem('KANAKU_encrypted_key', pinBackup.hash);
 if (pinBackup.salt) localStorage.setItem('KANAKU_salt', pinBackup.salt);
 if (pinBackup.adminSettings) localStorage.setItem('admin_global_feature_settings', pinBackup.adminSettings);
 } catch (e) {
 // Ignore
 }

 // Always redirect
 window.location.href = window.location.origin + '/login';
 }
 };

  const toggleFeature = (feature: string) => {
    const updated = { ...visibleFeatures, [feature]: !(visibleFeatures as any)[feature] } as any;
    setVisibleFeatures(updated);
    toast.success('Feature visibility updated');
  };

 const handleExportData = async (format: 'json' | 'csv' = 'json') => {
 try {
 const timestamp = new Date().toISOString().split('T')[0];
 const filename = `finance-life-backup-${timestamp}`;
 await downloadDataToFile(filename, format);
 } catch (error) {
 toast.error('Export failed');
 }
 };

 const handleCreateBackup = async () => {
 try {
 await createBackup();
 await loadBackups();
 } catch (error) {
 toast.error('Failed to create backup');
 }
 };

 const handleClearAllData = async () => {
 if (confirm('This will delete ALL your data. This action cannot be undone. Are you sure?')) {
 if (confirm('Are you ABSOLUTELY sure? This is your last warning!')) {
 try {
 // Clear cloud user-scoped entities first so sync does not restore cleared local records.
 const cloudTables = ['accounts', 'friends_sync', 'transactions', 'loans', 'goals', 'group_expenses_sync', 'investments'] as const;
 const cloudDeleteErrors: string[] = [];
 if (user?.id) {
 const results = await Promise.allSettled(
 cloudTables.map((table) => supabase.from(table).delete().eq('user_id', user.id)),
 );

 results.forEach((result, index) => {
 if (result.status === 'rejected') {
 cloudDeleteErrors.push(`${cloudTables[index]}: request failed`);
 return;
 }
 if (result.value.error) {
 cloudDeleteErrors.push(`${cloudTables[index]}: ${result.value.error.message}`);
 }
 });
 }

 // Prevent stale queued upserts from replaying after reload.
 localStorage.removeItem('KANAKU_sync_queue_v3');

 await runWithCloudSyncSuppressed(async () => {
 await Promise.all([
 db.accounts.clear(),
 db.friends.clear(),
 db.transactions.clear(),
 db.loans.clear(),
 db.loanPayments.clear(),
 db.goals.clear(),
 db.goalContributions.clear(),
 db.groupExpenses.clear(),
 db.investments.clear(),
 db.notifications.clear(),
 db.categories.clear(),
 db.importHistories.clear(),
 db.smsTransactions.clear(),
 db.documents.clear(),
 db.merchantProfiles.clear(),
 db.userCategoryPreferences.clear(),
 db.expenseBills.clear(),
 db.expenseCategories.clear(),
 db.budgets.clear(),
 db.taxCalculations.clear(),
 db.gold.clear(),
 db.groups.clear(),
 db.toDoItems.clear(),
 db.toDoLists.clear(),
 db.toDoListShares.clear(),
 db.chatMessages.clear(),
 db.chatConversations.clear(),
 db.bookingRequests.clear(),
 db.advisorAssignments.clear(),
 db.advisorSessions.clear(),
 db.financeAdvisors.clear(),
 db.logs.clear(),
 db.errorReports.clear(),
 db.backups.clear(),
 ]);
 });

 if (cloudDeleteErrors.length > 0) {
 console.warn('Cloud clear partial failures:', cloudDeleteErrors);
 toast.warning('Local data cleared. Some cloud rows could not be deleted right now.');
 } else {
 toast.success('All user data cleared. Profile/account identity has been preserved.');
 }
 refreshData();
 window.location.reload();
 } catch (error) {
 console.error('Failed to clear all data:', error);
 toast.error('Failed to clear all data');
 }
 }
 }
 };

 const handleToggleSmsDetection = async () => {
 setIsSmsBusy(true);

 try {
 if (!smsStatus.enabled) {
 toast.info('KANAKUreads bank transaction messages only to help track expenses automatically. SMS content stays on this device.');
 const result = await enableSmsTransactionDetection(30);
 setSmsStatus(result.status);

 if (!result.status.supported) {
 toast.error('SMS detection is available only on Android devices.');
 return;
 }

 if (!result.status.enabled) {
 toast.error('SMS permission is required to enable transaction detection.');
 return;
 }

 if (result.historicalScan.scanned > 0) {
 toast.success(`${result.historicalScan.created} SMS transactions ready for review from the last 30 days.`);
 } else {
 toast.success('SMS transaction detection enabled.');
 }
 return;
 }

 const status = await disableSmsTransactionDetection();
 setSmsStatus(status);
 toast.success('SMS transaction detection disabled.');
 } catch (error) {
 console.error('Failed to toggle SMS detection:', error);
 toast.error('Unable to update SMS transaction detection right now.');
 } finally {
 setIsSmsBusy(false);
 }
 };

 const handleRescanSms = async () => {
 setIsSmsBusy(true);

 try {
 const result = await scanHistoricalSmsTransactions(30, 300);
 await loadSmsStatus();
 toast.success(`${result.created} transactions detected from the last 30 days.`);
 } catch (error) {
 console.error('Historical SMS scan failed:', error);
 toast.error('Historical SMS scan failed.');
 } finally {
 setIsSmsBusy(false);
 }
 };

 const handleOpenSmsTransaction = async (smsTransactionId: number) => {
 const draft = await primeSmsTransactionDraft(smsTransactionId);
 if (!draft) {
 toast.error('SMS transaction could not be loaded.');
 return;
 }

 localStorage.setItem('quickBackPage', 'settings');
 setCurrentPage('add-transaction');
 };

 const handleIgnoreSms = async (smsTransactionId: number) => {
 await markSmsTransactionIgnored(smsTransactionId);
 toast.success('SMS transaction ignored.');
 };

 const handleClearSmsData = async () => {
 await clearSmsDetectedTransactions();
 toast.success('Stored SMS detections cleared from this device.');
 };

 // ─── Section definitions ─────────────────────────────────────────────────
 // Each section declares an optional `featureKey`. If that key is `false`
 // in visibleFeatures the entire card is hidden and the layout reflows.
 type SettingsSection = {
 id: string;
 featureKey?: keyof typeof visibleFeatures;
 node: React.ReactNode;
 };

 const sections: SettingsSection[] = [
 {
 id: 'preferences',
 node: (
 <motion.div
 key="preferences"
 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
 className="rounded-[30px] overflow-hidden relative bg-white/60 backdrop-blur-xl border border-white/40 shadow-glass"
 >
 <div className="p-6 border-b border-white/10">
 <h3 className="text-lg font-semibold text-gray-900">Preferences</h3>
 </div>
 <div className="divide-y divide-gray-200">
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Globe className="text-purple-600" size={20} />
 </div>
 <h4 className="font-medium text-gray-900">Language</h4>
 </div>
 <select
 value={language}
 onChange={(e) => { setLanguage(e.target.value); toast.success(`Language changed to ${e.target.value}`); }}
 className="px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
 aria-label="Select language"
 >
 <option value="en">English</option>
 <option value="es">Español (Spanish)</option>
 <option value="fr">Français (French)</option>
 <option value="de">Deutsch (German)</option>
 <option value="it">Italiano (Italian)</option>
 <option value="pt">Português (Portuguese)</option>
 <option value="ja">日本語 (Japanese)</option>
 <option value="zh">中文 (Chinese)</option>
 <option value="hi">हिंदी (Hindi)</option>
 <option value="ar">العربية (Arabic)</option>
 </select>
 </div>
 </div>
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Coins className="text-emerald-600" size={20} />
 </div>
 <h4 className="font-medium text-gray-900">Currency</h4>
 </div>
 <select
 value={currency}
 onChange={(e) => { setCurrency(e.target.value); toast.success(`Currency changed to ${e.target.value}`); }}
 className="px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
 aria-label="Select currency"
 >
 <option value="USD">USD ($)</option>
 <option value="INR">INR (₹)</option>
 <option value="EUR">EUR (€)</option>
 <option value="GBP">GBP (£)</option>
 <option value="JPY">JPY (¥)</option>
 <option value="AUD">AUD (A$)</option>
 <option value="CAD">CAD (C$)</option>
 <option value="SGD">SGD (S$)</option>
 <option value="CHF">CHF (CHF)</option>
 </select>
 </div>
 </div>
 </div>
 </motion.div>
 ),
 },
 {
 id: 'notifications',
 featureKey: 'notifications',
 node: (
 <motion.div
 key="notifications"
 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
 className="rounded-[30px] overflow-hidden relative bg-white/60 backdrop-blur-xl border border-white/40 shadow-glass"
 >
 <div className="p-6 border-b border-white/10">
 <h3 className="text-lg font-semibold text-gray-900">Notification Settings</h3>
 </div>
 <div className="divide-y divide-gray-200">
 {[
 { key: 'transactionAlerts', label: 'Transaction Alerts' },
 { key: 'budgetAlerts', label: 'Budget Alerts' },
 { key: 'loanReminders', label: 'Loan & EMI Reminders' },
 { key: 'groupExpenseUpdates', label: 'Group Expense Updates' },
 { key: 'goalProgressAlerts', label: 'Goal Progress Alerts' },
 { key: 'appUpdates', label: 'App Updates & Announcements' },
 ].map(({ key, label }) => (
 <div key={key} className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Bell className="text-blue-600" size={18} />
 </div>
 <h4 className="font-medium text-gray-900">{label}</h4>
 </div>
 <button
 type="button"
 aria-label={`Toggle ${label}`}
 onClick={() => toggleNotif(key)}
 className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 ${notifSettings[key] ? 'bg-black' : 'bg-gray-300'}`}
 >
 <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${notifSettings[key] ? 'translate-x-5' : 'translate-x-0'}`} />
 </button>
 </div>
 </div>
 ))}
 </div>
 </motion.div>
 ),
 },
 {
 id: 'sms',
 node: (
 <motion.div
 key="sms"
 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
 className="rounded-[30px] overflow-hidden relative bg-white/60 backdrop-blur-xl border border-white/40 shadow-glass"
 >
 <div className="p-6 border-b border-white/10">
 <div className="flex items-center justify-between gap-4">
 <div>
 <h3 className="text-lg font-semibold text-gray-900">SMS Transaction Detection</h3>
 <p className="text-sm text-gray-500 mt-0.5">Auto-detect bank SMS to track expenses</p>
 </div>
 <button
 type="button"
 onClick={handleToggleSmsDetection}
 disabled={isSmsBusy}
 className={`min-w-[112px] rounded-full px-4 py-2 text-sm font-semibold transition-all shadow-sm ${
 smsStatus.enabled ? 'bg-black text-white hover:bg-gray-900' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
 } ${isSmsBusy ? 'cursor-not-allowed opacity-60' : ''}`}
 >
 {isSmsBusy ? 'Working...' : smsStatus.enabled ? 'Turn Off' : 'Turn On'}
 </button>
 </div>
 </div>
 </motion.div>
 ),
 },
 {
 id: 'data-management',
 featureKey: 'dataExport',
 node: (
 <motion.div
 key="data-management"
 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
 className="rounded-[30px] overflow-hidden relative bg-white/60 backdrop-blur-xl border border-white/40 shadow-glass"
 >
 <div className="p-6 border-b border-white/10">
 <h3 className="text-lg font-semibold text-gray-900">Data Management</h3>
 </div>
 <div className="divide-y divide-gray-200">
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Download className="text-green-600" size={20} />
 </div>
 <h4 className="font-medium text-gray-900">Export Data</h4>
 </div>
 <div className="flex gap-2">
 <button onClick={() => handleExportData('json')} className="px-4 py-2 bg-black text-white rounded-full hover:bg-gray-900 transition-all active:scale-95 shadow-lg">JSON</button>
 <button onClick={() => handleExportData('csv')} className="px-4 py-2 bg-black text-white rounded-full hover:bg-gray-900 transition-all active:scale-95 shadow-lg">CSV</button>
 </div>
 </div>
 </div>
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Upload className="text-blue-600" size={20} />
 </div>
 <h4 className="font-medium text-gray-900">Import Data</h4>
 </div>
 <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-black text-white rounded-full hover:bg-gray-900 transition-all active:scale-95 cursor-pointer shadow-lg">Import</button>
 </div>
 </div>
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Database className="text-yellow-600" size={20} />
 </div>
 <h4 className="font-medium text-gray-900">Create Backup</h4>
 </div>
 <button onClick={handleCreateBackup} className="px-4 py-2 bg-black text-white rounded-full hover:bg-gray-900 transition-all active:scale-95 shadow-lg">Create</button>
 </div>
 </div>
 {backups.length > 0 && (
 <div className="p-6">
 <div className="flex items-center justify-between mb-4">
 <h4 className="font-medium text-gray-900">Backups ({backups.length})</h4>
 <button onClick={() => setShowBackups(!showBackups)} className="text-black hover:text-gray-700 text-sm font-medium">{showBackups ? 'Hide' : 'Show'}</button>
 </div>
 {showBackups && (
 <div className="space-y-2">
 {backups.map((backup, idx) => (
 <div key={idx} className="bg-white p-3 rounded flex justify-between items-center">
 <div className="text-sm">
 <p className="font-medium">{backup.filename}</p>
 <p className="text-gray-500">{new Date(backup.timestamp).toLocaleString()}</p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 {importHistory.length > 0 && (
 <div className="p-6">
 <div className="flex items-center justify-between mb-4">
 <h4 className="font-medium text-gray-900">Recent Imports ({importHistory.length})</h4>
 <button onClick={() => setShowImportHistory(!showImportHistory)} className="text-black hover:text-gray-700 text-sm font-medium">{showImportHistory ? 'Hide' : 'Show'}</button>
 </div>
 {showImportHistory && (
 <div className="space-y-3">
 {importHistory.map((entry, idx) => (
 <div key={entry.id ?? idx} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <p className="font-medium text-gray-900">{entry.fileName}</p>
 <p className="text-sm text-gray-500 mt-1">{new Date(entry.createdAt).toLocaleString()}</p>
 </div>
 <div className="text-right text-sm">
 <p className="text-gray-900 font-medium">{entry.importedRecords} imported</p>
 <p className="text-gray-500">{entry.skippedRecords} skipped · {entry.duplicateRecords} duplicates</p>
 </div>
 </div>
 {entry.createdCategories?.length > 0 && (
 <p className="text-sm text-gray-500 mt-2">Created categories: {entry.createdCategories.join(', ')}</p>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
 <Trash2 className="text-red-600" size={20} />
 </div>
 <h4 className="font-medium text-gray-900">Clear All Data</h4>
 </div>
 <button onClick={handleClearAllData} className="px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all active:scale-95 shadow-lg">Clear All</button>
 </div>
 </div>
 </div>
 </motion.div>
 ),
 },
 {
 id: 'legal',
 node: (
 <motion.div
 key="legal"
 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
 className="rounded-[30px] overflow-hidden relative bg-white/60 backdrop-blur-xl border border-white/40 shadow-glass"
 >
 <div className="p-6 border-b border-white/10">
 <h3 className="text-lg font-semibold text-gray-900">Legal</h3>
 </div>
 <div className="divide-y divide-gray-200">
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
 <FileText className="text-gray-500" size={18} />
 </div>
 <h4 className="font-medium text-gray-900">Privacy Policy</h4>
 </div>
 <button onClick={() => setCurrentPage('privacy-policy')} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
 View <ExternalLink size={14} />
 </button>
 </div>
 </div>
 <div className="p-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
 <FileText className="text-gray-500" size={18} />
 </div>
 <h4 className="font-medium text-gray-900">Terms &amp; Conditions</h4>
 </div>
 <button onClick={() => setCurrentPage('terms')} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
 View <ExternalLink size={14} />
 </button>
 </div>
 </div>
 </div>
 </motion.div>
 ),
 },
 ];

 // Filter sections: hide any section whose feature is explicitly disabled
 const visibleSections = sections.filter(s =>
 !s.featureKey || visibleFeatures?.[s.featureKey] !== false
 );

 // Distribute visible sections across 3 desktop columns (round-robin)
 const desktopColumns = useMemo(() => {
 const cols: SettingsSection[][] = [[], [], []];
 visibleSections.forEach((s, i) => cols[i % 3].push(s));
 return cols;
 }, [visibleSections]);

 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10 w-full pb-24">

 <PageHeader
 title="Settings"
 subtitle="Manage your preferences, data and privacy"
 icon={<SettingsIcon size={24} />}
 />

 {/* ── Mobile layout: single stack, feature-filtered ── */}
 <div className="lg:hidden space-y-6">
 {visibleSections.map(s => (
 <React.Fragment key={s.id}>{s.node}</React.Fragment>
 ))}
 </div>

 {/* ── Desktop layout: 3-column grid, dynamically balanced ── */}
 <div className="hidden lg:grid lg:grid-cols-3 gap-6 items-start">
 {desktopColumns.map((col, ci) => (
 <div key={ci} className="space-y-6">
 {col.map(s => (
 <React.Fragment key={s.id}>{s.node}</React.Fragment>
 ))}
 </div>
 ))}
 </div>

 {showImportModal && (
 <ImportDataModal
 accounts={accounts}
 userId={user?.id}
 onClose={() => setShowImportModal(false)}
 onImported={async () => {
 await loadImportHistory();
 await refreshData();
 }}
 />
 )}
 </div>
 );
};
