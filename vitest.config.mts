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
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Bez progu (`thresholds`) świadomie: próg dopisany w ciemno albo blokuje
    // CI na starcie, albo jest ustawiony tak nisko, że niczego nie pilnuje.
    // Najpierw liczba, dopiero potem decyzja, gdzie postawić poprzeczkę.
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
    },
  },
})
