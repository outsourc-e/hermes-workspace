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
    const stored = localStorage.getItem('openclaw-settings')
    const fallback = localStorage.getItem('chat-settings')
    let theme = 'light'
    let accent = 'orange'
    if (stored) {
      const parsed = JSON.parse(stored)
      const storedTheme = parsed?.state?.settings?.theme
      const storedAccent = parsed?.state?.settings?.accentColor
      if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
        theme = storedTheme
      }
      if (storedAccent === 'orange' || storedAccent === 'purple' || storedAccent === 'blue' || storedAccent === 'green') {
        accent = storedAccent
      }
    } else if (fallback) {
      const parsed = JSON.parse(fallback)
      const storedTheme = parsed?.state?.settings?.theme
      const storedAccent = parsed?.state?.settings?.accentColor
      if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
        theme = storedTheme
      }
      if (storedAccent === 'orange' || storedAccent === 'purple' || storedAccent === 'blue' || storedAccent === 'green') {
        accent = storedAccent
      }
    }
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    // Hermes Workspace theme class + data-theme attribute
    const enterpriseTheme = localStorage.getItem('clawsuite-theme')
    const isValidEnterpriseTheme =
      enterpriseTheme === 'ops-dark' ||
      enterpriseTheme === 'premium-dark' ||
      enterpriseTheme === 'paper-light'
    root.classList.remove('paper-light', 'ops-dark', 'premium-dark')
    if (isValidEnterpriseTheme) {
      root.setAttribute('data-theme', enterpriseTheme)
      root.classList.add(enterpriseTheme)
      if (enterpriseTheme === 'ops-dark' || enterpriseTheme === 'premium-dark') {
        theme = 'dark'
      } else {
        theme = 'light'
      }
    } else {
      root.removeAttribute('data-theme')
    }
    const apply = () => {
      root.classList.remove('light', 'dark', 'system')
      root.classList.add(theme)
      root.setAttribute('data-accent', accent)
      if (theme === 'system' && media.matches) {
        root.classList.add('dark')
      }
    }
    apply()
    media.addEventListener('change', () => {
      if (theme === 'system') apply()
    })
  } catch {}
})()
`

const themeColorScript = `
(() => {
  try {
    const root = document.documentElement
    const enterpriseTheme = localStorage.getItem('clawsuite-theme')
    const settingsRaw = localStorage.getItem('openclaw-settings')
    let appTheme = 'light'
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw)
      const saved = parsed?.state?.settings?.theme
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        appTheme = saved
      }
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = enterpriseTheme === 'ops-dark' || enterpriseTheme === 'premium-dark'
      ? true
      : enterpriseTheme === 'paper-light'
        ? false
        : appTheme === 'dark' || (appTheme === 'system' && prefersDark)
    const nextColor = isDark ? '#0f172a' : '#f97316'

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
        content: '#f97316',
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
            var bg = '#f8fafc', txt = '#0f172a', muted = '#64748b';
            try {
              var enterprise = localStorage.getItem('clawsuite-theme');
              var s = localStorage.getItem('openclaw-settings');
              var t = 'light';
              if (enterprise === 'ops-dark' || enterprise === 'premium-dark') {
                t = 'dark';
              } else if (enterprise === 'paper-light') {
                t = 'light';
              } else if (s) {
                var p = JSON.parse(s);
                t = (p && p.state && p.state.settings && p.state.settings.theme) || 'light';
              }
              if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              if (t === 'dark') { bg = '#0c0c12'; txt = '#f8fafc'; muted = '#94a3b8'; }
            } catch(e){}

            var quips = ["Warming up the claws...","Brewing agent espresso...","Deploying crustacean intelligence...","Loading forbidden knowledge...","Calibrating sarcasm module...","Spinning up the hive mind...","Polishing the shell...","Teaching agents to behave...","Summoning the swarm...","Initializing world domination...","Crunching the numbers (with claws)...","Consulting the oracle lobster...","Booting the lobster mainframe...","Decrypting the claw protocol..."];
            var quip = quips[Math.floor(Math.random() * quips.length)];

            var d = document.createElement('div');
            d.id = 'splash-screen';
            d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:'+bg+';transition:opacity 0.8s ease;';
            d.innerHTML = '<div style="width:96px;height:96px;margin-bottom:20px;filter:drop-shadow(0 8px 32px rgba(249,115,22,0.5))"><svg width="96" height="96" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sOB" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ea580c"/><stop offset="50%" stop-color="#f97316"/><stop offset="100%" stop-color="#fb923c"/></linearGradient></defs><rect x="5" y="5" width="90" height="90" rx="16" fill="url(#sOB)"/><rect x="20" y="25" width="60" height="50" rx="4" stroke="#1e293b" stroke-width="3" fill="none"/><circle cx="28" cy="32" r="2.5" fill="#1e293b"/><circle cx="37" cy="32" r="2.5" fill="#1e293b"/><circle cx="46" cy="32" r="2.5" fill="#1e293b"/><path d="M38 45L32 50L38 55" stroke="#1e293b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M62 45L68 50L62 55" stroke="#1e293b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="47" y="46" width="4" height="10" rx="2" fill="#1e293b"><animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></rect></svg></div>'
              + '<div style="font:700 24px/1 system-ui,-apple-system,sans-serif;letter-spacing:0.06em;color:'+txt+'">Hermes Workspace</div>'
              + '<div style="margin-top:10px;font:italic 13px/1 system-ui,-apple-system,sans-serif;color:'+muted+'">'+quip+'</div>'
              + '<div style="margin-top:28px;width:140px;height:3px;background:#1e293b;border-radius:3px;overflow:hidden"><div id=splash-bar style="width:0%;height:100%;background:linear-gradient(90deg,#ea580c,#f97316,#fb923c);border-radius:3px;transition:width 0.4s ease"></div></div>';
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
            glow.style.cssText = 'position:absolute;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,0.15) 0%,transparent 70%);animation:splashPulse 2s ease-in-out infinite;pointer-events:none;';
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
