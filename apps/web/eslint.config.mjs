import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
      "e2e/.auth/**",
      "e2e/report/**",
      "e2e/screenshots/**",
      "e2e/test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
