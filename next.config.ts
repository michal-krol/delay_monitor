import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json";

const isDev = process.env.NODE_ENV === "development";

/**
 * Gałąź, z której właśnie budujemy -- widoczna w UI (patrz AppTitle.tsx), żeby
 * odróżnić lokalny `dev` od produkcyjnego `main` na pierwszy rzut oka.
 *
 * Railway ustawia `RAILWAY_GIT_BRANCH` automatycznie z podłączonej gałęzi
 * GitHub, zarówno przy buildzie, jak i w runtime -- to źródło ma pierwszeństwo,
 * bo `.git` jest świadomie poza kontekstem builda Dockera (`.dockerignore`),
 * więc `git rev-parse` tam by się nie powiódł. Lokalnie (`npm run dev`/`build`)
 * `.git` jest obecne, więc spada się na nie. Wartość jest zamrożona przy
 * starcie/buildzie, nie na żywo w runtime -- restart po zmianie gałęzi jest
 * normalnym elementem tego workflow, nie warto tego komplikować.
 */
function detectGitBranch(): string {
  if (process.env.RAILWAY_GIT_BRANCH) return process.env.RAILWAY_GIT_BRANCH;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  } catch {
    return "unknown";
  }
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
  output: "standalone",

  // Domyślnie Next ogłasza się nagłówkiem X-Powered-By. Nie ma powodu ułatwiać
  // dopasowania podatności do wersji frameworka.
  poweredByHeader: false,

  // Wpisane tu trafiają do bundla klienta bez względu na prefiks (patrz
  // node_modules/next/dist/docs/.../env.md) -- NEXT_PUBLIC_ tu tylko dla
  // czytelności, nie funkcjonalnie wymagany. Wartości zamrożone przy buildzie.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_BRANCH: detectGitBranch(),
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
