import eslint from "@eslint/js";
import importX from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["main.js", "node_modules", "coverage"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "*.ts"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "import-x/no-unresolved": ["error", { ignore: ["^obsidian$"] }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
    settings: {
      "import-x/resolver": {
        typescript: true,
      },
    },
  },
  {
    files: ["*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
