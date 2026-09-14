import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    sourcemap: false, // SEC-14: never expose source in production
    rollupOptions: {
      // BUG FIX (2026-09-03): @capacitor/core (and everything depending on
      // it — /app, /local-notifications, /push-notifications) used to be
      // marked `external` here on the theory that they're native-only
      // packages that might not exist in a web deploy's node_modules, so
      // Rollup shouldn't try to bundle them. That premise was wrong — all
      // four are regular `dependencies` in package.json (always installed,
      // on Vercel too), and marking a package `external` doesn't make it a
      // safe no-op at runtime the way the removed comment claimed: a
      // dynamically-imported chunk's OWN static imports are still resolved
      // eagerly by the browser before any of its code runs, so an
      // externalized `@capacitor/core` left as a bare, unbundled specifier
      // crashes the ENTIRE app on load with "Uncaught TypeError: Failed to
      // resolve module specifier '@capacitor/core'" the moment ANYTHING
      // reaches a dynamic import() of a Capacitor plugin during boot —
      // confirmed live on-device building the Owner Android app (its
      // startup auto-login check does exactly that). The `dist/` output is
      // shared between the real website AND every native app build, so
      // this was a live, deployed crash risk sitting dormant precisely
      // because nothing exercised these dynamic imports during initial page
      // load on the web — bundling them normally (this codebase's default
      // for every other dependency) is correct and safe on both targets:
      // Capacitor.isNativePlatform() (and everything gated behind it)
      // simply evaluates to false in a browser, no native binding needed.
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("recharts") || id.includes("chart.js")) return "charts-vendor";
          // BUG FIX (2026-09-14): `dijkstrajs` is qrcode's own dependency
          // (used internally for QR segment-mode optimization,
          // `dijkstra.find_path(...)` in qrcode/lib/core/segments.js) but its
          // module id lives under its own node_modules folder, not under
          // "qrcode" — so it fell through to the generic `vendor` bucket
          // below, landing in a DIFFERENT chunk than the qrcode code that
          // `require()`s it. Splitting a CJS module from the sibling CJS
          // module it requires across two separate Rollup chunks breaks the
          // cross-chunk CJS interop binding, so `dijkstra` (the imported
          // object) came back `undefined` in production and every single
          // WhatsApp bill/QR generation (createWhatsappQrMedia /
          // createWhatsappBillDocument, called for every Hosur — and any
          // other — dispatch bill) threw "Cannot read properties of
          // undefined (reading 'find_path')" and silently failed to send.
          // Confirmed live: every hosur_whatsapp_logs 'bill' send failed
          // with this exact error from 2026-09-04 through 2026-09-14 (283
          // failures, zero successes) — this had been broken in production
          // for 10 days. Keep dijkstrajs in the same chunk as qrcode/jspdf.
          if (id.includes("jspdf") || id.includes("qrcode") || id.includes("dijkstrajs")) return "document-vendor";
          if (id.includes("framer-motion")) return "motion-vendor";
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) return "ui-vendor";
          return "vendor";
        },
      },
    },
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
