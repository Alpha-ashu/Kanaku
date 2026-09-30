/**
 * "Download my data" — the server's complete export, saved through downloadFile()
 * so it works in the browser AND the native apps (a blob <a download> is a no-op
 * in the Android/iOS WebView).
 *
 * The server export, not a dump of this device's IndexedDB: the device only
 * holds what it has synced, so a local dump silently missed budgets, bills,
 * advisor history and anything not yet pulled.
 */
import { downloadFile } from '@/lib/download';
import { accountLifecycleService } from '@/services/accountLifecycleService';

const today = () => new Date().toISOString().slice(0, 10);

/** Everything, as JSON (also importable back into KANAKU). */
export async function downloadMyDataJson(): Promise<void> {
  const json = await accountLifecycleService.exportAll();
  await downloadFile({
    filename: `kanaku-export-${today()}.json`,
    mimeType: 'application/json',
    data: json,
    shareTitle: 'KANAKU data export',
  });
}

/** Every transaction as CSV — opens in Excel/Sheets and in other finance apps. */
export async function downloadTransactionsCsv(): Promise<void> {
  const text = await accountLifecycleService.exportTransactionsCsv();
  // The browser's UTF-8 decoder drops the server's byte-order mark; without it
  // Excel opens ₹ and non-Latin names as mojibake. Put it back.
  const bom = String.fromCharCode(0xfeff);
  const csv = text.startsWith(bom) ? text : bom + text;
  await downloadFile({
    filename: `kanaku-transactions-${today()}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    data: csv,
    shareTitle: 'KANAKU transactions (CSV)',
  });
}
