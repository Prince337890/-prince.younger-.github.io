import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Catch any render-time crash so the dispatcher sees a recovery screen instead
// of a blank white page — and so an error in one view can't take down the
// whole portal silently.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Portal crashed:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            <p className="text-sm text-slate-400 mt-2">The portal hit an unexpected error and stopped rendering. Your data is safe — reloading usually fixes it.</p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={() => window.location.reload()} className="bg-amber-500 text-slate-950 font-semibold px-5 py-2.5 rounded-lg hover:bg-amber-400">Reload</button>
              <button onClick={() => { window.location.hash = ''; window.location.reload(); }} className="border border-slate-700 text-slate-300 px-5 py-2.5 rounded-lg hover:bg-slate-800">Back to Dashboard</button>
            </div>
            <p className="text-[11px] text-slate-600 mt-4">If it keeps happening, note what you were doing and let support know.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
