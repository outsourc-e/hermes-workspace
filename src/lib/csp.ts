/**
 * Single source of truth for the workspace Content Security Policy.
 *
 * Why this lives outside __root.tsx:
 *   - We emit CSP as an HTTP response header from the Node server (and from the
 *     Vite dev server) so the policy survives any edge body rewriting, e.g.
 *     Cloudflare's JS Challenge inserting a `<meta http-equiv="Content-Security-Policy">`
 *     with a per-request nonce into the served HTML when a request trips the
 *     "impersonate browsers" rule.
 *   - The `<meta>` form in __root.tsx is kept for SSR consistency but is now a
 *     secondary copy. If you change the policy here, you must rebuild __root.tsx.
 *     If you only change __root.tsx, the header stays authoritative.
 *
 * Policy notes:
 *   - `frame-ancestors` is ignored in `<meta>` and only honored as an HTTP
 *     header, so it is intentionally omitted from this list.
 *   - `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` are kept
 *     because TanStack Start SSR emits hydration inline `<script>` tags that
 *     have no nonce yet. Production-grade tightening would move to a hashing
 *     or `useServerInsertedHTML` nonce scheme; that is a follow-up.
 *   - `connect-src` allows ws:/wss:/http:/https: because the gateway + workspace
 *     daemon run on loopback and the browser may reach them via LAN/Tailscale.
 */
export const APP_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' ws: wss: http: https:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: data:",
  "frame-src 'self' http: https:",
] as const

export const APP_CSP = APP_CSP_DIRECTIVES.join('; ')

/**
 * Mirror directives for `<meta http-equiv="Content-Security-Policy">` in the
 * SSR HTML. The HTTP header remains the authoritative policy, but emitting
 * a meta tag too keeps the policy observable for direct file:// inspection
 * (e.g. SSR output debug pages) and prevents a regression where someone
 * disables the header by accident without the SSR code noticing.
 *
 * IMPORTANT: keep this list byte-for-byte identical to `APP_CSP_DIRECTIVES`
 * so the meta tag never disagrees with the header. The `--unsafe-inline` /
 * `--self` / `--none` keywords and every source expression must match.
 */
export const APP_CSP_META = APP_CSP
