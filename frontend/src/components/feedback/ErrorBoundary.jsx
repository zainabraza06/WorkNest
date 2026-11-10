import { Component } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Last line of defence for rendering errors.
 *
 * Without it, one thrown exception in any component unmounts the whole React tree and the user
 * is left on a blank white page with no way forward. This shows a recoverable screen instead,
 * and reports the error through `window.__worknestReportError` if a monitoring script (Sentry,
 * etc.) installs one — the app has no hard dependency on any vendor.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error:', error, info?.componentStack);
    try {
      window.__worknestReportError?.(error, { componentStack: info?.componentStack });
    } catch {
      // Reporting must never throw out of an error boundary
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl">Something went wrong</h1>
        <p className="max-w-md text-ink-500">
          An unexpected error stopped this page from loading. Your data is safe. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-md bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
        >
          <RefreshCw className="size-4" aria-hidden /> Reload
        </button>
      </div>
    );
  }
}
