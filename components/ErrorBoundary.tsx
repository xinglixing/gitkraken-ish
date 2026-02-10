import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-gk-bg flex items-center justify-center z-[100]">
          <div className="max-w-lg w-full bg-gk-panel border border-white/10 rounded-xl shadow-2xl p-8">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-8 h-8 text-gk-red mr-3" />
              <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              An unexpected error occurred. You can try dismissing this error or reloading the app.
            </p>
            {this.state.error && (
              <div className="bg-gk-red/10 border border-gk-red/30 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                <p className="text-gk-red text-xs font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            {this.state.errorInfo && (
              <details className="mb-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                  Stack trace
                </summary>
                <pre className="mt-2 text-[10px] text-gray-600 bg-black/30 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <div className="flex space-x-3">
              <button
                onClick={this.handleDismiss}
                className="flex-1 px-4 py-2 text-sm text-gray-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              >
                Try to Dismiss
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2 text-sm text-white bg-gk-blue rounded-lg hover:bg-gk-blue/80 transition-colors flex items-center justify-center"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
