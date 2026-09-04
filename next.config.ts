import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";

/**
 * Katalog projektu. Bez tego Turbopack szuka „root" w górę drzewa po pierwszym
 * napotkanym lockfile — a w worktree agenta (`.claude/worktrees/**`) trafia na
 * `package-lock.json` GŁÓWNEGO checkoutu i ostrzega przy każdym starcie.
 * `import.meta.url` działa i w `dev`, i w `build` (config ładowany jako ESM).
 */
const projectRoot = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

/**
 * Gałąź, z której właśnie budujemy -- widoczna w UI (patrz AppTitle.tsx), żeby
 * odróżnić lokalny `dev` od produkcyjnego `main` na pierwszy rzut oka.
 *
 * `RAILWAY_GIT_BRANCH` jest dostępne TYLKO, gdy deploy naprawdę wyzwolił push
 * na GitHubie (dokumentacja Railway: "provided if the deploy originated from
 * a GitHub trigger") -- ręczny redeploy albo zatwierdzenie staged changes
 * (tak powstał pierwszy build środowiska `development`) tego nie liczy, więc
 * zmienna bywa pusta nawet na Railway. Musi też być jawnie zadeklarowana jako
 * `ARG` w Dockerfile (etap `builder`) -- Railway "dostarcza" swoje zmienne do
 * builda, ale izolacja Dockera i tak je blokuje bez ARG (docs.railway.com/
 * builds/dockerfiles#using-variables-at-build-time); bez tego ta gałąź kodu
 * była martwa na produkcji i UI pokazywało "unknown", mimo że deploy
 * faktycznie przyszedł z pusha. `git rev-parse` to zapasowy, lokalny sposób
 * (`node:24-slim` w kontenerze Railway nie ma w ogóle binarki `git` -- ta
 * gałąź nigdy nie zadziała w Dockerze, tylko przy `npm run dev`/`build` na
 * maszynie dewelopera). Stąd trzeci poziom: `RAILWAY_ENVIRONMENT_NAME`
 * (też wymaga ARG w Dockerfile), które Railway wstawia do KAŻDEGO builda
 * bezwarunkowo (production/development) -- mniej precyzyjne niż nazwa
 * gałęzi, ale nigdy puste na Railway. Wartość zamrożona przy starcie/buildzie,
 * nie na żywo w runtime.
 */
function detectGitBranch(): string {
  if (process.env.RAILWAY_GIT_BRANCH) return process.env.RAILWAY_GIT_BRANCH;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  } catch {
    return process.env.RAILWAY_ENVIRONMENT_NAME ?? "unknown";
  }
}

/**
 * Czy pokazać panel diagnostyczny pollera w pasku bocznym
 * (`PollerDiagnostics.tsx`). **Allowlista, nie denylista** — i to jest tu
 * całą pointą.
 *
 * Kuszące `detectGitBranch() !== "main"` byłoby błędem: jak opisuje komentarz
 * wyżej, `RAILWAY_GIT_BRANCH` bywa puste nawet na Railway, a wtedy
 * `detectGitBranch()` schodzi do `RAILWAY_ENVIRONMENT_NAME`, czyli
 * `"production"` — nie `"main"`. Denylista pokazałaby więc panel dokładnie na
 * produkcji. Tutaj nieznana albo pusta wartość znaczy „produkcja" i panel nie
 * powstaje.
 *
 * Nowe środowisko Railway (np. `staging`) jest domyślnie wyłączone; włączenie
 * to dopisanie jednej wartości.
 */
function showDiagnostics(): boolean {
  return process.env.NODE_ENV === "development" || process.env.RAILWAY_ENVIRONMENT_NAME === "development";
}

/**
 * CSP pragmatyczna, nie ścisła — świadoma decyzja.
 *
 * Ścisła polityka wymagałaby nonce'ów dla każdego żądania, czyli middleware
 * generującego je i przepięcia `next-themes`. To nowy komponent architektury
 * i realne ryzyko mignięcia motywu albo błędów hydracji — nieuzasadnione przy
 * skali tego projektu.
 *
 * `'unsafe-inline'` w script-src jest wymuszone przez dwa skrypty inline
 * w dokumencie: dane hydracji Next oraz skrypt `next-themes`, który ustawia
 * motyw przed pierwszym malowaniem (bez niego wraca mignięcie). W style-src
 * jest potrzebne, bo React wstawia atrybuty `style` (m.in. CarrierLogo).
 *
 * Mimo tego ustępstwa polityka nadal odcina to, co najważniejsze: ładowanie
 * skryptów i połączenia do obcych origin, osadzanie strony w ramce, wtyczki
 * oraz przejęcie `<base>`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' wyłącznie w dev — wymaga go hot reload Turbopacka.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Przeglądarka rozmawia wyłącznie z naszym serwerem; w dev dochodzi websocket HMR.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Duplikuje frame-ancestors dla starszych przeglądarek bez obsługi CSP 2.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // ponytail: `next start` nie działa z output:standalone, a kopiowanie
  // static/public do .next/standalone (jak w Dockerfile) to zbędny narzut
  // w teście — pakiet e2e (playwright.config.ts) buduje bez standalone.
  output: process.env.E2E ? undefined : "standalone",

  // Patrz `projectRoot` wyżej -- w worktree Next inaczej wybiera lockfile
  // głównego checkoutu i ostrzega o „multiple lockfiles".
  turbopack: { root: projectRoot },

  // Domyślnie Next ogłasza się nagłówkiem X-Powered-By. Nie ma powodu ułatwiać
  // dopasowania podatności do wersji frameworka.
  poweredByHeader: false,

  // Wpisane tu trafiają do bundla klienta bez względu na prefiks (patrz
  // node_modules/next/dist/docs/.../env.md) -- NEXT_PUBLIC_ tu tylko dla
  // czytelności, nie funkcjonalnie wymagany. Wartości zamrożone przy buildzie.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_BRANCH: detectGitBranch(),
    NEXT_PUBLIC_SHOW_DIAGNOSTICS: String(showDiagnostics()),
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: isDev
          ? securityHeaders
          : [
              ...securityHeaders,
              // Railway serwuje wyłącznie po HTTPS. W dev pominięte, żeby nie
              // przypinać localhost do HTTPS w przeglądarce deweloperskiej.
              {
                key: "Strict-Transport-Security",
                value: "max-age=31536000; includeSubDomains",
              },
            ],
      },
    ];
  },
};

export default nextConfig;
