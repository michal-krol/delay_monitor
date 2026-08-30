import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import testingLibrary from "eslint-plugin-testing-library";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Reguly dla React Testing Library, wylacznie w plikach testowych — lapia
  // konkretna klase bledow (fireEvent zamiast userEvent, brak await waitFor,
  // zapytania po roli zamiast testid) automatycznie, zamiast polegac na
  // przegladzie recznym przy 25 plikach testow.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    ...testingLibrary.configs["flat/react"],
  },
  {
    files: ["src/components/icons.test.tsx"],
    rules: {
      "testing-library/no-container": "off",
      "testing-library/no-node-access": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Wygenerowany raport pokrycia (`npm run test:coverage`). Jest już
    // w .gitignore, ale eslint czyta katalog roboczy, nie indeks gita --
    // bez tego wpisu lint zgłasza uwagi do cudzego, generowanego kodu.
    "coverage/**",
  ]),
]);

export default eslintConfig;
