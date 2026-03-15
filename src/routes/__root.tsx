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

const THEME_STORAGE_KEY = 'clawsuite-theme'
const DEFAULT_THEME = 'hermes-dark'
const VALID_THEMES = ['hermes-dark', 'hermes-slate', 'hermes-mono']

const themeScript = `
(() => {
  window.process = window.process || { env: {}, platform: 'browser' };
  
  // Gateway connection via Hermes Workspace server proxy.
  // Clients connect to /ws-gateway on the Hermes Workspace server (same host:port as the page).
  // The server proxies internally to ws://127.0.0.1:18789 — so phone/LAN/Docker
  // users never need direct access to port 18789.
  // Manual override: set gatewayUrl in settings to skip proxy (e.g. wss:// remote).
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('openclaw-settings')
      const parsed = stored ? JSON.parse(stored) : null
      const manualUrl = parsed?.state?.settings?.gatewayUrl
      if (manualUrl && typeof manualUrl === 'string' && manualUrl.startsWith('ws')) {
        window.__GATEWAY_URL__ = manualUrl
      } else {
        // Use proxy path — works from any device that can reach Hermes Workspace
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        window.__GATEWAY_URL__ = proto + '//' + window.location.host + '/ws-gateway'
      }
    } catch {
      window.__GATEWAY_URL__ = 'ws://127.0.0.1:18789'
    }
  }
  
  try {
    const root = document.documentElement
    const storedTheme = localStorage.getItem('${THEME_STORAGE_KEY}')
    const theme = ${JSON.stringify(VALID_THEMES)}.includes(storedTheme) ? storedTheme : '${DEFAULT_THEME}'
    root.classList.add('dark')
    root.classList.remove('light', 'system')
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-accent', 'orange')
    root.style.setProperty('color-scheme', 'dark')
  } catch {}
})()
`

const themeColorScript = `
(() => {
  try {
    const root = document.documentElement
    const nextColor = '#0d0f12'

    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', nextColor)
    root.style.setProperty('color-scheme', 'dark')
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
          'Supercharged chat interface for OpenClaw AI agents with file explorer, terminal, and usage tracking',
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
        content: '#0d0f12',
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
        type: 'image/svg+xml',
        href: '/favicon.svg',
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
            var bg = '#0d0f12', txt = '#eceff4', muted = '#7f8a96', accent = '#b98a44';
            try {
              var theme = localStorage.getItem('${THEME_STORAGE_KEY}') || '${DEFAULT_THEME}';
              if (theme === 'hermes-slate') {
                bg = '#0d1117';
                txt = '#c9d1d9';
                muted = '#8b949e';
                accent = '#7eb8f6';
              } else if (theme === 'hermes-mono') {
                bg = '#111111';
                txt = '#e6edf3';
                muted = '#888888';
                accent = '#aaaaaa';
              }
            } catch(e){}

            var quips = ["Warming up the claws...","Brewing agent espresso...","Deploying crustacean intelligence...","Loading forbidden knowledge...","Calibrating sarcasm module...","Spinning up the hive mind...","Polishing the shell...","Teaching agents to behave...","Summoning the swarm...","Initializing world domination...","Crunching the numbers (with claws)...","Consulting the oracle lobster...","Booting the lobster mainframe...","Decrypting the claw protocol..."];
            var quip = quips[Math.floor(Math.random() * quips.length)];

            var d = document.createElement('div');
            d.id = 'splash-screen';
            d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:'+bg+';transition:opacity 0.8s ease;';
            d.innerHTML = '<div style="width:96px;height:96px;margin-bottom:20px;filter:drop-shadow(0 8px 32px color-mix(in srgb,'+accent+' 45%, transparent))"><svg width="96" height="96" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sOB" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="'+accent+'"/><stop offset="100%" stop-color="'+accent+'"/></linearGradient></defs><rect x="5" y="5" width="90" height="90" rx="16" fill="url(#sOB)" fill-opacity="0.18" stroke="'+accent+'" stroke-width="2"/><path d="M36 24C33 24 31 26 31 29C31 32 33 34 36 34C39 34 41 32 41 29C41 26 39 24 36 24ZM64 24C61 24 59 26 59 29C59 32 61 34 64 34C67 34 69 32 69 29C69 26 67 24 64 24ZM50 27C47 27 45 29 45 32V40L34 46C30 48 28 52 28 56C28 61 31 64 36 64H43V76C43 79 45 81 48 81H52C55 81 57 79 57 76V64H64C69 64 72 61 72 56C72 52 70 48 66 46L55 40V32C55 29 53 27 50 27ZM36 39C33 39 31 41 31 44C31 47 33 49 36 49C39 49 41 47 41 44C41 41 39 39 36 39ZM64 39C61 39 59 41 59 44C59 47 61 49 64 49C67 49 69 47 69 44C69 41 67 39 64 39Z" fill="'+accent+'"/></svg></div>'
              + '<div style="font:700 24px/1 system-ui,-apple-system,sans-serif;letter-spacing:0.06em;color:'+txt+'">Hermes Workspace</div>'
              + '<div style="margin-top:10px;font:italic 13px/1 system-ui,-apple-system,sans-serif;color:'+muted+'">'+quip+'</div>'
              + '<div style="margin-top:28px;width:140px;height:3px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden"><div id=splash-bar style="width:0%;height:100%;background:'+accent+';border-radius:3px;transition:width 0.4s ease"></div></div>';
            document.body.prepend(d);

            var bar = document.getElementById('splash-bar');
            if (bar) {
              setTimeout(function(){ bar.style.width='15%' }, 300);
              setTimeout(function(){ bar.style.width='40%' }, 800);
              setTimeout(function(){ bar.style.width='65%' }, 1500);
              setTimeout(function(){ bar.style.width='85%' }, 2500);
              setTimeout(function(){ bar.style.width='92%' }, 3200);
            }

            // Logo entrance animation
            var logo = d.querySelector('div');
            if (logo) {
              logo.style.cssText += ';opacity:0;transform:scale(0.85);transition:opacity 0.6s ease,transform 0.6s ease;';
              setTimeout(function(){ logo.style.opacity='1'; logo.style.transform='scale(1)'; }, 100);
            }

            // Pulsing glow behind logo
            var glow = document.createElement('div');
            glow.style.cssText = 'position:absolute;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,'+accent+' 18%, transparent) 0%,transparent 70%);animation:splashPulse 2s ease-in-out infinite;pointer-events:none;';
            d.insertBefore(glow, d.firstChild);
            // Position glow behind logo
            glow.style.cssText += 'top:50%;left:50%;transform:translate(-50%,-60%);';

            // Shimmer on progress bar
            var shimmer = document.createElement('div');
            shimmer.style.cssText = 'position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);animation:splashShimmer 1.5s ease-in-out infinite;';
            var barWrap = bar ? bar.parentElement : null;
            if (barWrap) { barWrap.style.position = 'relative'; barWrap.style.overflow = 'hidden'; barWrap.appendChild(shimmer); }

            // Add keyframes
            var style = document.createElement('style');
            style.textContent = '@keyframes splashPulse{0%,100%{opacity:0.5;transform:translate(-50%,-60%) scale(1)}50%{opacity:1;transform:translate(-50%,-60%) scale(1.15)}} @keyframes splashShimmer{0%{left:-100%}100%{left:100%}}';
            document.head.appendChild(style);

            window.__dismissSplash = function() {
              var el = document.getElementById('splash-screen');
              if (!el) return;
              if (bar) bar.style.width = '100%';
              setTimeout(function(){
                el.style.opacity = '0';
                setTimeout(function(){ el.remove(); }, 800);
              }, 300);
            };
            // Fallback: always dismiss after 8s
            setTimeout(function(){ window.__dismissSplash && window.__dismissSplash(); }, 8000);
            // Fast dismiss: if returning user (has gateway config in localStorage), skip splash quickly
            try {
              if (localStorage.getItem('clawsuite-gateway-url') || localStorage.getItem('gateway-url')) {
                setTimeout(function(){ window.__dismissSplash && window.__dismissSplash(); }, 800);
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
