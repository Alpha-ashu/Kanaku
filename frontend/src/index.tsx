import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import { BrowserRouter } from 'react-router-dom';
import { financialDataCaptureService } from '@/services/financialDataCaptureService';
import { setupGlobalErrorHandlers } from '@/lib/errorHandling';
import { runGlobalMigration } from '@/lib/migration';
import '@/styles/index.css';

// Perform global brand migration (KANKU -> KANAKU) before anything else
runGlobalMigration();

// Capture uncaught errors and unhandled rejections from app startup
setupGlobalErrorHandlers();

financialDataCaptureService.bindOnlineQueueProcessor();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

