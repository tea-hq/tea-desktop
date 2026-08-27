const skipFormatting = require("@vue/eslint-config-prettier/skip-formatting");
const vueTsEslintConfig = require("@vue/eslint-config-typescript").default;
const security = require("eslint-plugin-security");
const pluginVue = require("eslint-plugin-vue");

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    name: "app/global-ignores",
    ignores: [
      "**/.codegraph/**",
      "**/.histoire/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/target/**",
      "**/test-results/**",
      "**/*.d.ts",
    ],
  },
  {
    name: "app/files-to-lint",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },

  {
    name: "app/files-to-ignore",
    ignores: ["**/dist-ssr/**", "**/coverage/**", "*.config.*"],
  },

  {
    name: "app/rules",
    rules: {
      "no-var": "error",
      "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
      "comma-dangle": ["error", "only-multiline"],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["primevue/*"],
              message: "Import Tea primitives from @/shared/ui.",
            },
            {
              group: ["@primeuix/themes", "@primeuix/themes/*"],
              message: "Theme ownership belongs in src/shared/ui.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  ...pluginVue.configs["flat/recommended"],
  ...vueTsEslintConfig(),

  {
    name: "app/shared-ui-library-access",
    files: ["src/shared/ui/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  skipFormatting,

  security.configs.recommended,
];
