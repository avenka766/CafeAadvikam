import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (err) {
  // If React fails to mount (e.g. module-level crash in a dependency),
  // show a visible error instead of a blank white page.
  const root = document.getElementById('root');
  if (root) {
    const msg = err instanceof Error ? err.message : String(err);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:24px;background:#fdf8f3">
        <div style="max-width:480px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h1 style="font-size:20px;font-weight:700;margin-bottom:8px;color:#1a0f0a">App failed to start</h1>
          <p style="color:#666;font-size:14px;margin-bottom:16px">${msg}</p>
          <p style="color:#999;font-size:12px;background:#f5f0ea;padding:12px;border-radius:8px">
            Check Vercel → Settings → Environment Variables → ensure
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set for Preview, then Redeploy.
          </p>
          <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#2D7D6F;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">
            Reload
          </button>
        </div>
      </div>`;
  }
  console.error('[CafeAadvikam] Fatal mount error:', err);
}
