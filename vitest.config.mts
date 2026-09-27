import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
  test: {
    /**
     * Katalogi robocze agentów (`.claude/worktrees/**`) to pełne kopie repo,
     * więc bez tego wykluczenia `npm run test` uruchomiony w głównym checkoucie
     * zbiera KAŻDY test z KAŻDEJ gałęzi roboczej naraz -- 3208 przypadków
     * zamiast 690, a alias `@` rozwiązuje się przy tym na `src` głównego
     * drzewa, nie tej kopii. Efekt: setki porażek, które nie są błędami
     * w żadnym z tych drzew. Gita to nie dotyczy (`.git/info/exclude`), więc
     * CI zawsze widziało poprawny zestaw -- ale lokalnie mylące i kilka razy
     * wolniejsze.
     */
    // `e2e/**` to Playwright (`*.spec.ts`), nie Vitest -- patrz AGENTS.md #16.
    exclude: [...configDefaults.exclude, '**/.claude/**', 'e2e/**'],
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Bez `include` raport obejmuje wyłącznie pliki, które jakiś test
      // zaimportował -- moduł bez ani jednego testu w ogóle by się w nim nie
      // pojawił, czyli dokładnie ten, o którym najbardziej chcemy wiedzieć.
      // (W Vitest 3 służyła do tego osobna opcja `all`; w 4 została usunięta,
      // a samo podanie `include` daje ten sam efekt.)
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test-utils/**',
        '**/*.test.{ts,tsx}',
        // Same deklaracje typów -- zero kodu wykonywalnego, więc obecność
        // w raporcie tylko rozmywa procent.
        'src/lib/pkp/types.ts',
      ],
      /**
       * Progi celowo NIŻSZE niż stan faktyczny w chwili ich ustawiania
       * (92,4% instrukcji / 90,1% gałęzi / 92,2% funkcji / 94,5% linii).
       * Mają łapać REGRESJĘ -- czyli świadome albo przypadkowe zdjęcie
       * pokrycia z całego obszaru -- a nie karać za pojedynczy wiersz, którego
       * sensownie nie da się przetestować. Zapas ok. 2-3 pkt proc. jest po to,
       * żeby zwykła praca nie wymagała dyskusji z bramką; podnosić przy okazji,
       * gdy stan faktyczny od niego odjedzie, nie ustawiać ambitnie z góry.
       */
      thresholds: {
        statements: 89,
        branches: 87,
        functions: 89,
        lines: 91,
      },
    },
  },
})
