import React from 'react';

interface Props {
  children: React.ReactNode;
  context?: Record<string, unknown>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  decoded: DecodedError | null;
  loading: boolean;
}

interface DecodedError {
  plain: string;
  why: string;
  fix: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'border-green-500 bg-green-950',
  medium: 'border-yellow-500 bg-yellow-950',
  high: 'border-red-500 bg-red-950',
  critical: 'border-pink-500 bg-pink-950',
};

const SEVERITY_BADGES: Record<string, string> = {
  low: 'bg-green-700 text-green-100',
  medium: 'bg-yellow-700 text-yellow-100',
  high: 'bg-red-700 text-red-100',
  critical: 'bg-pink-700 text-pink-100',
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, decoded: null, loading: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info);
    this.setState({ errorInfo: info });
    if (import.meta.env.DEV) {
      this.decodeError(error, info);
    }
  }

  async decodeError(error: Error, info: React.ErrorInfo) {
    this.setState({ loading: true });
    try {
      const res = await fetch('/api/debug-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack?.slice(0, 2000),
          componentStack: info.componentStack?.slice(0, 1000),
          context: this.props.context ?? {},
        }),
      });
      if (res.ok) {
        const data = await res.json();
        this.setState({ decoded: data });
      }
    } catch (e) {
      console.error('[ErrorBoundary] decode failed:', e);
    } finally {
      this.setState({ loading: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = import.meta.env.DEV;
    const { decoded, loading, error } = this.state;

    if (!isDev) {
      return (
        <div
          data-theme="light"
          className="flex flex-col items-center justify-center h-screen bg-base-100 gap-4 p-8"
        >
          <span className="text-5xl">⚠️</span>
          <h2 className="text-xl font-bold text-base-content">Something went wrong</h2>
          <p className="text-sm text-base-content/60 text-center max-w-sm">
            {error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      );
    }

    // Dev mode
    const sev = decoded?.severity ?? 'high';
    const colorClass = SEVERITY_COLORS[sev] ?? SEVERITY_COLORS.high;
    const badgeClass = SEVERITY_BADGES[sev] ?? SEVERITY_BADGES.high;

    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-mono text-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🐛</span>
          <div>
            <h1 className="text-lg font-bold text-white">Dev Error Decoder</h1>
            <p className="text-gray-400 text-xs">AI-powered crash analysis — dev only</p>
          </div>
          <button
            className="ml-auto px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-200"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-900 rounded border border-gray-700">
          <div className="text-red-400 font-bold mb-1">{error?.name}: {error?.message}</div>
          <div className="text-gray-500 text-xs whitespace-pre-wrap">
            {error?.stack?.split('\n').slice(1, 5).join('\n')}
          </div>
        </div>

        {loading && (
          <div className="p-4 bg-gray-900 rounded border border-gray-700 text-gray-400 animate-pulse">
            Asking AI to decode this crash...
          </div>
        )}

        {decoded && !loading && (
          <div className={`p-4 rounded border-2 ${colorClass} space-y-4`}>
            <div className="flex gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${badgeClass}`}>
                {decoded.severity}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-200 uppercase">
                {decoded.category}
              </span>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase mb-1 tracking-wider">What went wrong</div>
              <div className="text-white">{decoded.plain}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase mb-1 tracking-wider">Why it happened</div>
              <div className="text-gray-200">{decoded.why}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase mb-1 tracking-wider">How to fix it</div>
              <div className="text-green-300 font-semibold">{decoded.fix}</div>
            </div>
          </div>
        )}

        {this.state.errorInfo?.componentStack && (
          <details className="mt-4">
            <summary className="text-gray-500 text-xs cursor-pointer hover:text-gray-300">
              Component stack
            </summary>
            <pre className="mt-2 text-gray-600 text-xs overflow-auto max-h-48">
              {this.state.errorInfo.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

export function useErrorDecoder() {
  const decode = async (
    error: unknown,
    context?: Record<string, unknown>
  ): Promise<DecodedError | null> => {
    if (!import.meta.env.DEV) return null;
    const err = error instanceof Error ? error : new Error(String(error));
    try {
      const res = await fetch('/api/debug-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: err.message,
          stack: err.stack?.slice(0, 2000),
          context: context ?? {},
        }),
      });
      if (res.ok) return res.json();
    } catch (e) {
      console.error('[useErrorDecoder]', e);
    }
    return null;
  };
  return { decode };
}
