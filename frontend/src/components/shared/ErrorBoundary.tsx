import React from 'react';
import { logger } from '@/lib/logger';
import { reportError } from '@/lib/errorHandling';
import { newErrorReference } from '@/lib/clientErrorReporter';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  /** Shown to the user and logged with the report, so the two can be joined. */
  reference: string | null;
}

/**
 * Top-level error boundary mounted above the entire React tree.
 *
 * Catches any uncaught render error from providers, routers, or page
 * components and replaces the broken UI with a generic, user-safe
 * fallback. Technical detail is never shown to the user — but it IS now
 * recorded: the report goes to /client-errors (see lib/clientErrorReporter)
 * carrying the stack, component stack, route, platform and session id.
 *
 * The user is shown a short reference instead. Previously this screen gave them
 * nothing to quote and the shared logger is silent in production builds, so a
 * report of "it said something went wrong" was genuinely untraceable.
 *
 * For per-route boundaries that auto-recover from lazy-import failures,
 * see `PageErrorBoundary` inside `app/App.tsx`.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, reference: null };

  static getDerivedStateFromError(): ErrorBoundaryState {
    // The reference is minted here so it exists even if componentDidCatch is
    // never reached, and is passed into the report so the id the user reads on
    // screen is the same one in the log line.
    return { hasError: true, reference: newErrorReference() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const reference = this.state.reference ?? newErrorReference();
    logger.error('[ErrorBoundary] Render error captured', { name: error.name, reference }, info);
    reportError(error, { componentStack: info.componentStack, reference });
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
        <p style={{ opacity: 0.8, marginBottom: '16px', maxWidth: '420px' }}>
          We hit an unexpected problem. Please try again in a moment.
        </p>
        {this.state.reference && (
          <p
            data-testid="error-boundary-reference"
            style={{ opacity: 0.6, marginBottom: '20px', fontSize: '13px' }}
          >
            Reference:{' '}
            <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {this.state.reference}
            </code>
          </p>
        )}
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

