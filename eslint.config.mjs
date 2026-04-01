import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prevent src/types/ from importing game internals.
  // The shared types layer must be independent of src/game/ so
  // dependencies flow game → types, never the reverse.
  {
    name: "types-boundary",
    files: ["src/types/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/game/**", "@/game"],
              message:
                "src/types/ must not import from the game layer. Move shared types into src/types/ instead.",
            },
            {
              group: ["../game/**", "../../game/**"],
              message:
                "src/types/ must not import from the game layer (relative path). Move shared types into src/types/ instead.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
