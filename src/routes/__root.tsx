import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import appCss from '../styles.css?url'
import { SearchModal } from '@/components/search/search-modal'
import { TerminalShortcutListener } from '@/components/terminal-shortcut-listener'
import { GlobalShortcutListener } from '@/components/global-shortcut-listener'
import { WorkspaceShell } from '@/components/workspace-shell'
import { MobilePromptTrigger } from '@/components/mobile-prompt/MobilePromptTrigger'
import { Toaster } from '@/components/ui/toast'
import { OnboardingTour } from '@/components/onboarding/onboarding-tour'
import { KeyboardShortcutsModal } from '@/components/keyboard-shortcuts-modal'
import { initializeSettingsAppearance } from '@/hooks/use-settings'
import { useApplyChatWidth } from '@/hooks/use-chat-settings'
import {
  ClaudeOnboarding,
  ONBOARDING_COMPLETE_EVENT,
  ONBOARDING_KEY,
} from '@/components/onboarding/claude-onboarding'
import { ErrorBoundary } from '@/components/error-boundary'
import { LoginScreen } from '@/components/auth/login-screen'
import { fetchClaudeAuthStatus, type AuthStatus } from '@/lib/claude-auth'
import { getRootSurfaceState } from './-root-layout-state'


const APP_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "frame-src 'self' http: https:",
].join('; ')

const THEME_STORAGE_KEY = 'claude-theme'
const DEFAULT_THEME = 'claude-nous'
const VALID_THEMES = [
  'claude-nous',
  'claude-nous-light',
  'claude-official',
  'claude-official-light',
  'claude-classic',
  'claude-classic-light',
  'claude-slate',
  'claude-slate-light',
]

const themeScript = `
(() => {
  window.process = window.process || { env: {}, platform: 'browser' };

  try {
    const root = document.documentElement
    const storedTheme = localStorage.getItem('${THEME_STORAGE_KEY}')
    const theme = ${JSON.stringify(VALID_THEMES)}.includes(storedTheme) ? storedTheme : '${DEFAULT_THEME}'
    const lightThemes = ['claude-nous-light', 'claude-official-light', 'claude-classic-light', 'claude-slate-light']
    const isDark = !lightThemes.includes(theme)
    root.classList.remove('light', 'dark', 'system')
    root.classList.add(isDark ? 'dark' : 'light')
    root.setAttribute('data-theme', theme)
    root.style.setProperty('color-scheme', isDark ? 'dark' : 'light')

    // Demo mode
    try {
      if (new URLSearchParams(window.location.search).get('demo') === '1') {
        document.documentElement.setAttribute('data-demo', 'true');
      }
    } catch {}
  } catch {}
})()
`

const themeColorScript = `
(() => {
  try {
    const root = document.documentElement
    const theme = root.getAttribute('data-theme') || '${DEFAULT_THEME}'
    const colors = {
      'claude-nous': '#031A1A',
      'claude-nous-light': '#F8FAF8',
      'claude-official': '#0A0E1A',
      'claude-official-light': '#F7F7F1',
      'claude-classic': '#0d0f12',
      'claude-classic-light': '#F5F2ED',
      'claude-slate': '#0d1117',
      'claude-slate-light': '#F6F8FA',
    }
    const nextColor = colors[theme] || colors['${DEFAULT_THEME}']
    const isDark = !['claude-nous-light', 'claude-official-light', 'claude-classic-light', 'claude-slate-light'].includes(String(theme))

    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', nextColor)
    root.style.setProperty('color-scheme', isDark ? 'dark' : 'light')
  } catch {}
})()
`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual',
      },
      {
        title: 'Hermes Workspace',
      },
      {
        name: 'description',
        content:
          'Hermes Agent workspace for chat, tools, files, memory, and jobs.',
      },
      {
        property: 'og:image',
        content: '/cover.png',
      },
      {
        property: 'og:image:type',
        content: 'image/png',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:image',
        content: '/cover.png',
      },
      // PWA meta tags
      {
        name: 'theme-color',
        content: '#0A0E1A',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'default',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/png',
        href: '/claude-avatar.png',
      },
      // PWA manifest and icons
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
    ],
  }),

  shellComponent: RootDocument,
  component: RootLayout,
  errorComponent: function RootError({ error }) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-primary-50">
        <h1 className="text-2xl font-semibold text-primary-900 mb-4">
          Something went wrong
        </h1>
        <pre className="p-4 bg-primary-100 rounded-lg text-sm text-primary-700 max-w-full overflow-auto mb-6">
          {error instanceof Error ? error.message : String(error)}
        </pre>
        <button
          onClick={() => (window.location.href = '/')}
          className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          Return Home
        </button>
      </div>
    )
  },
})

const queryClient = new QueryClient()

export function getRootLayoutMode(onboardingComplete: string | null): 'onboarding' | 'workspace' {
  return onboardingComplete === 'true' ? 'workspace' : 'onboarding'
}

export function wrapInlineScript(source: string): string {
  return `(() => {\n  try {\n${source}\n  } catch (error) {\n    console.error('Inline bootstrap script failed', error)\n  }\n})()`
}

type ServiceWorkerLike = {
  getRegistrations: () => Promise<ReadonlyArray<{ unregister: () => boolean | Promise<boolean> | void | Promise<void> }>>
}

type CachesLike = {
  keys: () => Promise<Array<string>>
  delete: (name: string) => Promise<boolean> | boolean
}

export async function unregisterServiceWorkers({
  serviceWorker,
  cachesApi,
}: {
  serviceWorker?: ServiceWorkerLike
  cachesApi?: CachesLike
}): Promise<void> {
  await serviceWorker
    ?.getRegistrations()
    .then((registrations) =>
      Promise.allSettled(
        registrations.map((registration) => registration.unregister()),
      ),
    )
    .catch(() => undefined)

  await cachesApi
    ?.keys()
    .then((names) => Promise.allSettled(names.map((name) => cachesApi.delete(name))))
    .catch(() => undefined)
}

function RootLayout() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    null,
  )
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  useApplyChatWidth()

  useEffect(() => {
    initializeSettingsAppearance()

    const syncOnboardingCompletion = () => {
      try {
        setOnboardingComplete(localStorage.getItem(ONBOARDING_KEY) === 'true')
      } catch {
        setOnboardingComplete(false)
      }
    }

    if (typeof window === 'undefined') {
      return undefined
    }

    syncOnboardingCompletion()

    void fetch('/api/connection-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((status: { ok?: boolean; chatReady?: boolean; modelConfigured?: boolean } | null) => {
        if (status?.ok || (status?.chatReady && status?.modelConfigured)) {
          localStorage.setItem(ONBOARDING_KEY, 'true')
          syncOnboardingCompletion()
        }
      })
      .catch(() => undefined)

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ONBOARDING_KEY) return
      syncOnboardingCompletion()
    }

    const handleOnboardingCompleteChanged = () => {
      syncOnboardingCompletion()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(
      ONBOARDING_COMPLETE_EVENT,
      handleOnboardingCompleteChanged,
    )

    void unregisterServiceWorkers({
      serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
      cachesApi: 'caches' in window ? caches : undefined,
    })

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(
        ONBOARDING_COMPLETE_EVENT,
        handleOnboardingCompleteChanged,
      )
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let cancelled = false
    fetchClaudeAuthStatus()
      .then((status) => {
        if (!cancelled) setAuthStatus(status)
      })
      .catch(() => {
        if (!cancelled) {
          setAuthStatus({ authenticated: true, authRequired: false })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rootSurfaceState = getRootSurfaceState(onboardingComplete, authStatus)

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      {rootSurfaceState.showLogin ? <LoginScreen /> : null}
      {rootSurfaceState.showOnboarding ? <HermesOnboarding /> : null}
      {rootSurfaceState.showWorkspaceShell ? (
        <>
          <GlobalShortcutListener />
          <TerminalShortcutListener />
          <WorkspaceShell>
            <ErrorBoundary
              className="h-full min-h-0 flex-1"
              title="Something went wrong"
              description="This page failed to render. Reload to try again."
            >
              <Outlet />
            </ErrorBoundary>
          </WorkspaceShell>
          <SearchModal />
          <KeyboardShortcutsModal />
          {rootSurfaceState.showPostOnboardingOverlays ? (
            <>
              <MobilePromptTrigger />
              <OnboardingTour />
            </>
          ) : null}
        </>
      ) : null}
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={APP_CSP} />
        <script
          dangerouslySetInnerHTML={{
            __html: wrapInlineScript(`
          // Polyfill crypto.randomUUID for non-secure contexts (HTTP access via LAN IP)
          if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
            crypto.randomUUID = function() {
              return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function(c) {
                return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
              });
            };
          }
        `),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: wrapInlineScript(themeScript) }} />
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{ __html: wrapInlineScript(themeColorScript) }}
        />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: wrapInlineScript(`
          (function(){
            if (document.getElementById('splash-screen')) return;
            var bg = '#031A1A', txt = '#F8F1E3', muted = '#9CB2AE', accent = '#FFAC02';
            try {
              var theme = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
              if (theme === 'claude-nous') {
                bg = '#031A1A';
                txt = '#F8F1E3';
                muted = '#9CB2AE';
                accent = '#FFAC02';
              } else if (theme === 'claude-nous-light') {
                bg = '#F8FAF8';
                txt = '#16315F';
                muted = '#6F7D96';
                accent = '#2557B7';
              } else if (theme === 'claude-classic') {
                bg = '#0d0f12';
                txt = '#eceff4';
                muted = '#7f8a96';
                accent = '#b98a44';
              } else if (theme === 'claude-official-light') {
                bg = '#F7F7F1';
                txt = '#16315F';
                muted = '#6F7D96';
                accent = '#2557B7';
              } else if (theme === 'claude-classic-light') {
                bg = '#F5F2ED';
                txt = '#1a1f26';
                muted = '#6F675E';
                accent = '#b98a44';
              } else if (theme === 'claude-slate') {
                bg = '#0d1117';
                txt = '#c9d1d9';
                muted = '#8b949e';
                accent = '#7eb8f6';
              } else if (theme === 'claude-slate-light') {
                bg = '#F6F8FA';
                txt = '#24292f';
                muted = '#57606A';
                accent = '#3b82f6';
              }
            } catch(e){}

            var isDark = !['claude-nous-light','claude-official-light','claude-classic-light','claude-slate-light'].includes(theme);
            var quips = ["Consulting the oracle...","Loading ancient knowledge...","Warming up the messenger...","Calibrating tool chain...","Summoning your agent...","Preparing the workspace...","Bridging realms...","Initializing agent runtime..."];
            var quip = quips[Math.floor(Math.random() * quips.length)];

            var d = document.createElement('div');
            d.id = 'splash-screen';
            d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:'+bg+';transition:opacity 0.5s ease;';
            d.innerHTML = '<img src="/claude-avatar.webp" alt="Hermes Agent" style="width:80px;height:80px;margin-bottom:20px;border-radius:16px;filter:drop-shadow(0 8px 32px color-mix(in srgb,'+accent+' 45%, transparent))" />'
              + '<img src="'+(isDark ? '/claude-banner.png' : '/claude-banner-light.png')+'" alt="Hermes Workspace" style="width:280px;height:auto;margin-bottom:8px;filter:drop-shadow(0 4px 16px '+(isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)')+')" />'
              + '<div style="font:400 14px/1 system-ui,-apple-system,sans-serif;letter-spacing:0.04em;color:'+muted+'">Workspace</div>'
              + '<div style="margin-top:28px;width:140px;height:3px;background:'+(isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')+';border-radius:3px;overflow:hidden;position:relative"><div id=splash-bar style="width:0%;height:100%;background:'+accent+';border-radius:3px;transition:width 0.4s ease"></div></div>';
            document.body.prepend(d);

            var bar = document.getElementById('splash-bar');
            if (bar) {
              setTimeout(function(){ bar.style.width='15%' }, 300);
              setTimeout(function(){ bar.style.width='40%' }, 800);
              setTimeout(function(){ bar.style.width='65%' }, 1500);
              setTimeout(function(){ bar.style.width='85%' }, 2500);
              setTimeout(function(){ bar.style.width='92%' }, 3200);
            }

            window.__dismissSplash = function() {
              var el = document.getElementById('splash-screen');
              if (!el) return;
              if (bar) bar.style.width = '100%';
              setTimeout(function(){
                el.style.opacity = '0';
                setTimeout(function(){ el.remove(); }, 500);
              }, 300);
            };
            // Fallback: always dismiss after 5s
            setTimeout(function(){ window.__dismissSplash && window.__dismissSplash(); }, 5000);
            // Fast dismiss: returning users skip quickly
            try {
              if (localStorage.getItem('claude-claude-url') || localStorage.getItem('claude-url')) {
                setTimeout(function(){ window.__dismissSplash && window.__dismissSplash(); }, 600);
              }
            } catch(e) {}
          })()
        `),
          }}
        />
        <div className="root">{children}</div>
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: wrapInlineScript(`
          (function(){
            var start = Date.now();
            function check() {
              var el = document.querySelector('nav, aside, .workspace-shell, [data-testid]');
              var elapsed = Date.now() - start;
              if (el && elapsed > 2500) { window.__dismissSplash && window.__dismissSplash(); }
              else { setTimeout(check, 200); }
            }
            setTimeout(check, 2500);
          })()
        `),
          }}
        />
      </body>
    </html>
  )
}
