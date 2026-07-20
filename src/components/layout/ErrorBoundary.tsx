// src/components/layout/ErrorBoundary.tsx
// Fix: OBS-01 — no React error boundaries
// Fix: U-17  — "Try Again" resets the boundary instead of forcing a full page reload
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createClientDiagnostic, diagnosticText, reportClientDiagnostic, type ClientDiagnostic } from '@/lib/errorDiagnostics';

interface Props  { children: ReactNode; fallback?: ReactNode; }
interface State  { hasError: boolean; error: Error | null; errorCount: number; diagnostic: ClientDiagnostic | null; copied: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorCount: 0, diagnostic: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    const diagnostic = createClientDiagnostic({
      message: error.message,
      details: info.componentStack || undefined,
      stack: error.stack,
      module: 'React rendering',
      severity: 'fatal',
    });
    this.setState({ diagnostic });
    void reportClientDiagnostic(diagnostic);
  }

  // U-17 FIX: reset boundary state to re-render children — no page reload, no lost store state
  handleTryAgain = () => {
    this.setState(s => ({ hasError: false, error: null, errorCount: s.errorCount + 1, diagnostic: null, copied: false }));
  };

  handleCopy = async () => {
    if (!this.state.diagnostic) return;
    try {
      await navigator.clipboard.writeText(diagnosticText(this.state.diagnostic));
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
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
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
              <p><strong>Reference:</strong> {this.state.diagnostic?.reference || 'Preparing details'}</p>
              <p><strong>User:</strong> {this.state.diagnostic?.user ? `${this.state.diagnostic.user.displayName} (${this.state.diagnostic.user.username})` : 'Not logged in'}</p>
              <p><strong>Role:</strong> {this.state.diagnostic?.user?.role || '-'}</p>
              <p><strong>Page:</strong> {this.state.diagnostic?.route || location.pathname}</p>
              <p className="mt-1 break-words font-mono">{this.state.error?.message}</p>
            </div>
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
              <button
                onClick={() => void this.handleCopy()}
                className="px-5 py-2 rounded-xl border border-border text-foreground text-sm font-body font-semibold"
              >
                {this.state.copied ? 'Copied' : 'Copy details'}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
