import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import appCss from '../styles.css?url'
import { SearchModal } from '@/components/search/search-modal'
import { TerminalShortcutListener } from '@/components/terminal-shortcut-listener'
import { GlobalShortcutListener } from '@/components/global-shortcut-listener'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useTaskReminders } from '@/hooks/use-task-reminders'
import { UpdateNotifier } from '@/components/update-notifier'
import { OpenClawUpdateNotifier } from '@/components/openclaw-update-notifier'
import { MobilePromptTrigger } from '@/components/mobile-prompt/MobilePromptTrigger'
import { Toaster } from '@/components/ui/toast'
import { OnboardingTour } from '@/components/onboarding/onboarding-tour'
import { KeyboardShortcutsModal } from '@/components/keyboard-shortcuts-modal'
import { CompactionNotifier } from '@/components/compaction-notifier'
import { FallbackBanner } from '@/components/fallback-banner'
import { GatewayRestartProvider } from '@/components/gateway-restart-overlay'
import { ExecApprovalToast } from '@/components/exec-approval-toast'
import { initializeSettingsAppearance } from '@/hooks/use-settings'

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

const THEME_STORAGE_KEY = 'hermes-theme'
const DEFAULT_THEME = 'hermes-official'
const VALID_THEMES = [
  'hermes-official',
  'hermes-official-light',
  'hermes-classic',
  'hermes-classic-light',
  'hermes-slate',
  'hermes-slate-light',
  'hermes-mono',
  'hermes-mono-light',
]

const themeScript = `
(() => {
  window.process = window.process || { env: {}, platform: 'browser' };
  
  // Hermes Workspace — API is same-origin REST/SSE, no WebSocket needed.
  // __GATEWAY_URL__ kept as stub for any legacy code that references it.
  if (typeof window !== 'undefined') {
    window.__GATEWAY_URL__ = ''
  }
  
  try {
    const root = document.documentElement
    const storedTheme = localStorage.getItem('${THEME_STORAGE_KEY}')
    const theme = ${JSON.stringify(VALID_THEMES)}.includes(storedTheme) ? storedTheme : '${DEFAULT_THEME}'
    const lightThemes = ['hermes-official-light', 'hermes-classic-light', 'hermes-slate-light', 'hermes-mono-light']
    const isDark = !lightThemes.includes(theme)
    root.classList.remove('light', 'dark', 'system')
    root.classList.add(isDark ? 'dark' : 'light')
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-accent', 'orange')
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
      'hermes-official': '#0A0E1A',
      'hermes-official-light': '#F6F8FC',
      'hermes-classic': '#0d0f12',
      'hermes-classic-light': '#F5F2ED',
      'hermes-slate': '#0d1117',
      'hermes-slate-light': '#F6F8FA',
      'hermes-mono': '#111111',
      'hermes-mono-light': '#FAFAFA',
    }
    const nextColor = colors[theme] || colors['${DEFAULT_THEME}']
    const isDark = !['hermes-official-light', 'hermes-classic-light', 'hermes-slate-light', 'hermes-mono-light'].includes(String(theme))

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
          'Supercharged chat interface for Hermes AI agents with file explorer, terminal, and usage tracking',
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
        href: '/hermes-caduceus.png',
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

function TaskReminderRunner() {
  useTaskReminders()
  return null
}

function RootLayout() {
  // Unregister any existing service workers — they cause stale asset issues
  // after Docker image updates and behind reverse proxies (Pangolin, Cloudflare, etc.)
  useEffect(() => {
    initializeSettingsAppearance()

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
        }
      })
      // Also clear any stale caches
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name)
          }
        })
      }
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <GatewayRestartProvider>
      <CompactionNotifier />
      <FallbackBanner />
      <GlobalShortcutListener />
      <TerminalShortcutListener />
      <TaskReminderRunner />
      <UpdateNotifier />
      <OpenClawUpdateNotifier />
      <MobilePromptTrigger />
      <Toaster />
      <ExecApprovalToast />
      <WorkspaceShell />
      <SearchModal />
      <OnboardingTour />
      <KeyboardShortcutsModal />
      </GatewayRestartProvider>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={APP_CSP} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeColorScript }} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            if (document.getElementById('splash-screen')) return;
            var bg = '#0A0E1A', txt = '#E6EAF2', muted = '#9AA5BD', accent = '#6366F1';
            try {
              var theme = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
              if (theme === 'hermes-classic') {
                bg = '#0d0f12';
                txt = '#eceff4';
                muted = '#7f8a96';
                accent = '#b98a44';
              } else if (theme === 'hermes-official-light') {
                bg = '#F6F8FC';
                txt = '#111827';
                muted = '#4B5563';
                accent = '#4F46E5';
              } else if (theme === 'hermes-classic-light') {
                bg = '#F5F2ED';
                txt = '#1a1f26';
                muted = '#6F675E';
                accent = '#b98a44';
              } else if (theme === 'hermes-slate') {
                bg = '#0d1117';
                txt = '#c9d1d9';
                muted = '#8b949e';
                accent = '#7eb8f6';
              } else if (theme === 'hermes-slate-light') {
                bg = '#F6F8FA';
                txt = '#24292f';
                muted = '#57606A';
                accent = '#3b82f6';
              } else if (theme === 'hermes-mono') {
                bg = '#111111';
                txt = '#e6edf3';
                muted = '#888888';
                accent = '#aaaaaa';
              } else if (theme === 'hermes-mono-light') {
                bg = '#FAFAFA';
                txt = '#1a1a1a';
                muted = '#666666';
                accent = '#666666';
              }
            } catch(e){}

            var isDark = !['hermes-official-light','hermes-classic-light','hermes-slate-light','hermes-mono-light'].includes(theme);
            var quips = ["Consulting the oracle...","Loading ancient knowledge...","Warming up the messenger...","Calibrating tool chain...","Summoning Hermes...","Preparing the workspace...","Bridging realms...","Initializing agent runtime..."];
            var quip = quips[Math.floor(Math.random() * quips.length)];

            var d = document.createElement('div');
            d.id = 'splash-screen';
            d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:'+bg+';transition:opacity 0.5s ease;';
            d.innerHTML = '<img src="/hermes-avatar.webp" alt="Hermes" style="width:80px;height:80px;margin-bottom:20px;border-radius:16px;filter:drop-shadow(0 8px 32px color-mix(in srgb,'+accent+' 45%, transparent))" />'
              + '<img src="'+(isDark ? '/hermes-banner.png' : '/hermes-banner-light.png')+'" alt="Hermes Workspace" style="width:280px;height:auto;margin-bottom:8px;filter:drop-shadow(0 4px 16px '+(isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)')+')" />'
              + '<div style="font:400 14px/1 system-ui,-apple-system,sans-serif;letter-spacing:0.04em;color:'+muted+'">Workspace</div>'
              + '<div style="margin-top:20px;display:flex;gap:4px;align-items:center">'
              + '<span class="splash-dot" style="width:5px;height:5px;border-radius:50%;background:'+accent+';opacity:0.3"></span>'
              + '<span class="splash-dot" style="width:5px;height:5px;border-radius:50%;background:'+accent+';opacity:0.3"></span>'
              + '<span class="splash-dot" style="width:5px;height:5px;border-radius:50%;background:'+accent+';opacity:0.3"></span>'
              + '</div>';
            document.body.prepend(d);

            // Simple dot animation
            var style = document.createElement('style');
            style.textContent = '@keyframes splashDot{0%,80%,100%{opacity:0.3}40%{opacity:1}}'+'.splash-dot:nth-child(1){animation:splashDot 1.2s ease-in-out infinite}'+'.splash-dot:nth-child(2){animation:splashDot 1.2s ease-in-out 0.2s infinite}'+'.splash-dot:nth-child(3){animation:splashDot 1.2s ease-in-out 0.4s infinite}';
            document.head.appendChild(style);

            window.__dismissSplash = function() {
              var el = document.getElementById('splash-screen');
              if (!el) return;
              el.style.opacity = '0';
              setTimeout(function(){ el.remove(); }, 500);
            };
            // Fallback: always dismiss after 5s
            setTimeout(function(){ window.__dismissSplash && window.__dismissSplash(); }, 5000);
            // Fast dismiss: returning users skip quickly
            try {
              if (localStorage.getItem('hermes-gateway-url') || localStorage.getItem('gateway-url')) {
                setTimeout(function(){ window.__dismissSplash && window.__dismissSplash(); }, 600);
              }
            } catch(e) {}
          })()
        `}} />
        <div className="root">{children}</div>
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: `
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
        `}} />
      </body>
    </html>
  )
}
