import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { initializeProductionFeatures } from './lib/production';
import { initializeSecurity } from './lib/security';
import { initializePerformanceOptimizations } from './lib/performance';
import { initializePWAFeatures } from './lib/pwa-production';
import { initializeEnvironment } from './lib/environment';
import { initializeNotifications } from './lib/notifications';

// Production initialization
function initializeApp(): void {
  try {
    // Initialize environment first
    initializeEnvironment();

    // Initialize production features
    initializeProductionFeatures();

    // Initialize security features
    initializeSecurity();

    // Initialize performance optimizations
    initializePerformanceOptimizations();

    // Initialize PWA features
    initializePWAFeatures();

    // Initialize notifications
    initializeNotifications();

    // Render the app
    const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    console.log('KANAKUApp initialized successfully in production mode');
  } catch (error) {
    console.error('Failed to initialize app:', error);

    // Fallback rendering
    const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
    root.render(
      <div className="p-5 text-center font-sans">
        <h1>Application Error</h1>
        <p>Sorry, the application failed to load. Please refresh the page and try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-blue-600 text-white rounded cursor-pointer border-0"
        >
          Refresh Page
        </button>
      </div>
    );
  }
}

// Handle critical errors
window.addEventListener('error', (event) => {
  console.error('Critical error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
