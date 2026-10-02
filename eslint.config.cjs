const tsPlugin = require("@typescript-eslint/eslint-plugin");
const reactPlugin = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const jsxA11y = require("eslint-plugin-jsx-a11y");
const nextPlugin = require("@next/eslint-plugin-next");

module.exports = [
  {
    ignores: [".next", "node_modules", "convex/_generated", "coverage", "public/monaco"]
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: require("@typescript-eslint/parser")
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react": reactPlugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "@next/next": nextPlugin
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    // The plugins' recommended sets, then project overrides. The config used to list a handful of
    // rules by hand, with `any` and exhaustive-deps only warnings.
    rules: {
      ...tsPlugin.configs["eslint-recommended"].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      ...jsxA11y.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      // TypeScript checks props; prop-types would duplicate it.
      "react/prop-types": "off"
    }
  }
];
