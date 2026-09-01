import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [".next/**", "dist/**", "next-env.d.ts"],
    rules: {
      // These effects intentionally hydrate browser-only localStorage/cache
      // state after SSR. React 18 has no server-safe lazy initializer for it.
      "react-hooks/set-state-in-effect": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
];

export default config;
