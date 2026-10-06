import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    try {
      sessionStorage.removeItem('desktop_last_path');
    } catch {
      // ignore
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={36} />
            </div>

            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              An unexpected error occurred in this view. You can reload the window or return to the dashboard.
            </p>

            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl transition"
              >
                <RefreshCw size={18} /> Reload Application
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 px-4 rounded-xl transition"
              >
                <Home size={18} /> Return to Dashboard
              </button>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <summary className="text-xs font-semibold text-slate-500 cursor-pointer">
                  Developer Error Details
                </summary>
                <pre className="mt-2 text-xs text-red-400 overflow-auto max-h-36 whitespace-pre-wrap">
                  {this.state.error.toString()}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
