import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // AUDIT FIX (2026-09-09): "dist" was the only ignored path — ESLint's
  // recommended-config layer isn't scoped by the `files` glob below, so it
  // was still running against generated Capacitor/Android build output
  // (e.g. android/**/build/**/native-bridge.js), which uses a bundler's own
  // minified output and isn't real project source. That produced 4 spurious
  // "rule not found" errors (a plugin-resolution artifact of linting
  // non-project JS), which is what forced CI's lint step behind
  // `continue-on-error`.
  { ignores: ["dist", "android", "ios", "mobile-apps"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
