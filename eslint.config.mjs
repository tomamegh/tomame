import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { 
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
         },
      ],
    },
  },
  {
    // design/ holds the vendored redesign mocks (.dc.html + their support JS).
    // Reference material, never imported by the app — not ours to lint.
    ignores: [".next/**", "node_modules/**", "design/**", ".claude/**"],
  },
];
