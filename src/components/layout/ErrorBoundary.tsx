// src/components/layout/ErrorBoundary.tsx
// Fix: OBS-01 — no React error boundaries
// Fix: U-17  — "Try Again" resets the boundary instead of forcing a full page reload
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props  { children: ReactNode; fallback?: ReactNode; }
interface State  { hasError: boolean; error: Error | null; errorCount: number; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // OBS-02 hook: replace console.error with Sentry.captureException(error, { extra: info })
    console.error('[ErrorBoundary]', error, info);
  }

  // U-17 FIX: reset boundary state to re-render children — no page reload, no lost store state
  handleTryAgain = () => {
    this.setState(s => ({ hasError: false, error: null, errorCount: s.errorCount + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="max-w-sm text-center space-y-4">
            <div className="text-5xl">⚠️</div>
            <h1 className="font-display text-2xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground font-body">
              An unexpected error occurred. You can try again — your cart and form data should still be intact.
            </p>
            <p className="text-xs text-muted-foreground/60 font-mono break-all">
              {this.state.error?.message}
            </p>
            <div className="flex gap-3 justify-center">
              {/* U-17 FIX: primary action resets boundary without losing Zustand state */}
              <button
                onClick={this.handleTryAgain}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-body font-semibold"
              >
                Try again
              </button>
              {/* Full reload as a secondary escape hatch */}
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 rounded-xl border border-border text-foreground text-sm font-body font-semibold"
              >
                Refresh page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
