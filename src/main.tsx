import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/studio.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class StudioErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            color: '#f8fafc',
            background: '#0b0f19',
            fontFamily: 'monospace',
            height: '100vh',
            overflow: 'auto',
          }}
        >
          <h2 style={{ color: '#f87171', marginTop: 0 }}>
            Visual DOM Studio Runtime Error
          </h2>
          <pre
            style={{
              background: '#111827',
              padding: 16,
              borderRadius: 8,
              border: '1px solid #1f2937',
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root container #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <StudioErrorBoundary>
      <App />
    </StudioErrorBoundary>
  </React.StrictMode>
);
