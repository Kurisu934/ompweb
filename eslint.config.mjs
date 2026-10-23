import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Private workstation helpers are outside the published application.
  { ignores: ["scripts/wireguard/**", "story/**", ".omp/**", ".codex/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    // These entry points run as native CommonJS, where require is the module API.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
