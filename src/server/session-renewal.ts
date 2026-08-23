import {
  createSessionCookie,
  getSessionTokenFromCookie,
  isAuthenticated,
  isPasswordProtectionEnabled,
  touchSessionToken,
} from './auth-middleware'

/**
 * Calcule l'en-tête `Set-Cookie` de renouvellement pour cette requête.
 *
 * @returns la valeur du `Set-Cookie`, ou `null` s'il n'y a rien à renouveler :
 *   - protection par mot de passe désactivée (mode reverse-proxy) → `null`
 *   - pas de cookie `claude-auth` / token invalide ou expiré → `null`
 *   - token valide mais renouvelé il y a moins d'une fenêtre → `null` (throttle)
 */
export function renewSessionCookie(request: Request): string | null {
  if (!isPasswordProtectionEnabled()) return null
  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) return null
  if (!touchSessionToken(token)) return null
  return createSessionCookie(token)
}

/**
 * Enveloppe une réponse en y ajoutant, si nécessaire, le `Set-Cookie` de
 * renouvellement.
 *
 * - Ne consomme JAMAIS le corps : on réutilise `response.body` tel quel, donc
 *   les réponses en flux (SSE de /api/chat-events, /api/send-stream) passent
 *   sans être bufferisées.
 * - Utilise `headers.append` : un `Set-Cookie` déjà posé par la route n'est pas
 *   écrasé.
 * - Ajoute `Cache-Control: no-store` quand un cookie est émis (piège P4).
 * - Retourne la réponse d'origine à l'identique quand il n'y a rien à faire
 *   (coût nul sur le chemin chaud).
 */
export function withRenewedSession(request: Request, response: Response): Response {
  const cookie = renewSessionCookie(request)
  if (!cookie) return response
  const headers = new Headers(response.headers)
  headers.append('Set-Cookie', cookie)
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Garde d'authentification standardisée + renouvellement.
 *
 * Remplace le motif dupliqué ~128 fois :
 *     if (!isAuthenticated(request)) return json({ error: 'Unauthorized' }, { status: 401 })
 *
 * Usage :
 *     const denied = requireAuth(request)
 *     if (denied) return denied
 *     return withRenewedSession(request, json({ … }))
 */
export function requireAuth(request: Request): Response | null {
  if (isAuthenticated(request)) return null
  return new Response(
    JSON.stringify({ ok: false, error: 'Unauthorized', authRequired: true, authenticated: false }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        // Marqueur explicite pour l'intercepteur frontend (§4.2) : atteste que ce
        // 401 provient de la garde d'authentification *workspace*, et non d'un
        // backend tiers dont le statut est remonté tel quel par un proxy interne
        // (cf. §2.4). Sa présence autorise une bascule immédiate en 'expired' ;
        // son absence n'autorise qu'une *sonde* de confirmation.
        'X-Hermes-Auth': 'required',
      },
    },
  )
}
