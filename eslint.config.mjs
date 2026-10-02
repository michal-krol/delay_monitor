import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import testingLibrary from "eslint-plugin-testing-library";

const FONT_RULE = { name: "next/font/google", message: "Use next/font/local with a file in src/app/fonts/ (the build must not need the network)." };
const ICON_MESSAGE = "Import icons from @/components/icons — the single icon source (.claude/rules/ui-icons.md).";
const ICON_RULES = ["lucide", "lucide-react"].map((name) => ({ name, message: ICON_MESSAGE }));
// Głębokie ścieżki (`lucide/dist/esm/icons/star.mjs`) — `paths` porównuje cały specyfikator.
const ICON_PATTERNS = [{ group: ["lucide/*", "lucide-react/*"], message: ICON_MESSAGE }];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Reguly dla React Testing Library, wylacznie w plikach testowych — lapia
  // konkretna klase bledow (fireEvent zamiast userEvent, brak await waitFor,
  // zapytania po roli zamiast testid) automatycznie, zamiast polegac na
  // przegladzie recznym.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    ...testingLibrary.configs["flat/react"],
  },
  // next/font/google pobiera czcionke z sieci przy buildzie — build ma byc
  // odtwarzalny bez sieci (AGENTS.md #16). Fonty leza w src/app/fonts/.
  // Ikony mają jedno źródło: `src/components/icons.tsx` (.claude/rules/ui-icons.md).
  {
    rules: {
      "no-restricted-imports": ["error", {
        paths: [FONT_RULE, ...ICON_RULES],
        patterns: ICON_PATTERNS,
      }],
    },
  },
  {
    files: ["src/components/icons.tsx"],
    rules: {
      "no-restricted-imports": ["error", { paths: [FONT_RULE] }],
    },
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
    // Katalogi robocze agentów -- pełne kopie repo. Bez tego `npm run lint`
    // w głównym checkoucie sprawdza każdą gałąź roboczą naraz i kończy się
    // błędem (560 plików, wyłącznie stamtąd), mimo że główne drzewo jest
    // czyste. Ten sam powód co `exclude` w vitest.config.mts; gita to nie
    // dotyczy (`.git/info/exclude`), więc CI zawsze widziało poprawny zestaw.
    ".claude/**",
    // Wygenerowany raport pokrycia (`npm run test:coverage`). Jest już
    // w .gitignore, ale eslint czyta katalog roboczy, nie indeks gita --
    // bez tego wpisu lint zgłasza uwagi do cudzego, generowanego kodu.
    "coverage/**",
    // Wendorowana, zminifikowana kopia workera MapLibre (MapView.tsx) --
    // cudzy, zbudowany kod, nie coś, co edytujemy. `MapView.test.tsx`
    // pilnuje, że kopia zgadza się bajt-w-bajt z node_modules.
    "public/maplibre-gl-worker.mjs",
    "public/maplibre-gl-shared.mjs",
  ]),
]);

export default eslintConfig;
