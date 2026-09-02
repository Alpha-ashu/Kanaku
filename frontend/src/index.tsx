import '@/styles/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from '@/app/App';
import { BrowserRouter } from 'react-router-dom';
import { financialDataCaptureService } from '@/services/financialDataCaptureService';
import { setupGlobalErrorHandlers, registerErrorReporter } from '@/lib/errorHandling';
import { runGlobalMigration } from '@/lib/migration';
import { initSchemaGuard } from '@/lib/syncSchemaGuard';
import { initOfflineUploadQueue } from '@/lib/offlineUploadQueue';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

// Initialize Sentry if VITE_SENTRY_DSN is configured
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE || 'production',
      tracesSampleRate: 0.1,
    });
    registerErrorReporter((err, context) => {
      Sentry.captureException(err, { extra: context });
    });
  } catch (sentryErr) {
    console.warn('[Startup] Sentry initialization skipped:', sentryErr);
  }
}

// Perform safe startup procedures (non-blocking)
try {
  runGlobalMigration();
} catch (e) {
  console.warn('[Startup] Global migration skipped:', e);
}

try {
  setupGlobalErrorHandlers();
} catch (e) {
  console.warn('[Startup] Error handlers setup skipped:', e);
}

try {
  void initSchemaGuard().catch((error) => {
    console.warn('[Startup] Schema guard init skipped:', error);
  });
} catch (e) {
  console.warn('[Startup] Schema guard skipped:', e);
}

try {
  financialDataCaptureService.bindOnlineQueueProcessor();
} catch (e) {
  console.warn('[Startup] Online queue processor binding skipped:', e);
}

try {
  initOfflineUploadQueue();
} catch (e) {
  console.warn('[Startup] Offline upload queue init skipped:', e);
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (renderError) {
    console.error('[Startup] Failed to render root:', renderError);
    rootElement.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:24px;text-align:center;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;">
        <div style="max-width:320px;">
          <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">Welcome to KANAKU</h2>
          <p style="font-size:14px;color:#64748b;margin-bottom:16px;">Starting your finance dashboard...</p>
          <button onclick="window.location.reload()" style="background:#2563eb;color:#ffffff;border:none;padding:10px 20px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">Refresh</button>
        </div>
      </div>
    `;
  }
}

