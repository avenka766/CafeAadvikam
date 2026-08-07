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
      // Capacitor packages (@capacitor/core, /local-notifications,
      // /push-notifications) only exist for the native Android build —
      // src/lib/nativeNotifications.ts reaches them via dynamic `import()`
      // wrapped in try/catch specifically so it's a safe no-op on the web
      // build (see that file's header comment). Marking them external stops
      // Rollup from trying to statically resolve/bundle them for the
      // website build; at runtime on the web the dynamic import simply
      // rejects (module not found) and the existing try/catch treats that
      // exactly like "not running inside the native app". Without this,
      // Vercel's web deploy fails outright if these native-only packages
      // aren't present in node_modules there, even though the site never
      // needs them.
      external: ['@capacitor/core', '@capacitor/local-notifications', '@capacitor/push-notifications'],
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("recharts") || id.includes("chart.js")) return "charts-vendor";
          if (id.includes("jspdf") || id.includes("qrcode")) return "document-vendor";
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
