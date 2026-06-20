import React from 'react';
import { logger } from '@/lib/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level error boundary mounted above the entire React tree.
 *
 * Catches any uncaught render error from providers, routers, or page
 * components and replaces the broken UI with a generic, user-safe
 * fallback. Technical detail is logged via the shared logger (which is
 * silent in production), never shown to the user.
 *
 * For per-route boundaries that auto-recover from lazy-import failures,
 * see `PageErrorBoundary` inside `app/App.tsx`.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error('[ErrorBoundary] Render error captured', { name: error.name }, info);
  }

  private handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      // Ignore — environments without window (e.g. SSR test harness).
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div data-testid="error-boundary-div"
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#0b0f17',
          color: '#e6edf3',
        }}
      >
        <h1 style={{ fontSize: '20px', marginBottom: '8px' }}>Something went wrong</h1>
        <p style={{ opacity: 0.8, marginBottom: '20px', maxWidth: '420px' }}>
          We hit an unexpected problem. Please try again in a moment.
        </p>
        <button data-testid="error-boundary-reload-app"
          type="button"
          onClick={this.handleReload}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: '1px solid #30363d',
            background: '#21262d',
            color: '#e6edf3',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Reload app
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;

