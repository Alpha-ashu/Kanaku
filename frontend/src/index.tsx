import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from '@/app/App';
import { BrowserRouter } from 'react-router-dom';
import { financialDataCaptureService } from '@/services/financialDataCaptureService';
import { setupGlobalErrorHandlers, registerErrorReporter } from '@/lib/errorHandling';
import { runGlobalMigration } from '@/lib/migration';
import { initSchemaGuard } from '@/lib/syncSchemaGuard';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

// Initialize Sentry if VITE_SENTRY_DSN is configured
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || 'production',
    tracesSampleRate: 0.1,
  });
  registerErrorReporter((err, context) => {
    Sentry.captureException(err, { extra: context });
  });
}

// Perform global brand migration (KANAKU -> KANAKU) before anything else
runGlobalMigration();

// Capture uncaught errors and unhandled rejections from app startup
setupGlobalErrorHandlers();

// Compare the local Dexie schema against what the backend expects.
//
// syncSchemaGuard shipped with a docstring saying "wire this into your
// bootstrap" and never was — nothing imported it. Web auto-deploys on every
// push while Android and iOS are installed by hand, so the three platforms
// routinely run different local schemas against one backend with no check at
// all. Non-blocking: it warns when merely behind and only halts below the
// backend's hard floor.
void initSchemaGuard().catch((error) => {
  console.warn('[Startup] Schema guard init skipped:', error);
});

financialDataCaptureService.bindOnlineQueueProcessor();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

