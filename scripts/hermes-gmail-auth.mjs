#!/usr/bin/env node
/**
 * One-time Gmail OAuth (desktop loopback flow).
 *
 * Reads GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET from
 * ~/.hermes/.env, opens the consent URL in the default browser, catches the
 * redirect on 127.0.0.1, exchanges the code, and writes the token bundle
 * (incl. refresh_token) to ~/.hermes/google-token.json (mode 600).
 *
 * Scope: gmail.modify (read + label; no send, no delete-forever).
 */
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

const envFile = readFileSync(join(homedir(), '.hermes', '.env'), 'utf8')
const get = (name) =>
  envFile
    .split('\n')
    .find((l) => l.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .replace(/^["']|["']$/g, '')
    .trim() ?? ''

const CLIENT_ID = get('GOOGLE_OAUTH_CLIENT_ID')
const CLIENT_SECRET = get('GOOGLE_OAUTH_CLIENT_SECRET')
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET')
  process.exit(1)
}

const SCOPE = 'https://www.googleapis.com/auth/gmail.modify'
const TOKEN_PATH = join(homedir(), '.hermes', 'google-token.json')

const server = createServer()
// Fixed port: web-type OAuth clients require a pre-registered redirect URI.
server.listen(8765, '127.0.0.1', () => {
  const port = 8765
  const redirect = `http://127.0.0.1:${port}/`
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
    })
  console.log('Opening browser for Google consent…')
  execFile('open', [url])

  server.on('request', async (req, res) => {
    const u = new URL(req.url, redirect)
    const code = u.searchParams.get('code')
    if (!code) {
      res.writeHead(400).end('No code')
      return
    }
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: redirect,
          grant_type: 'authorization_code',
        }),
      })
      const tokens = await tokenRes.json()
      if (!tokens.refresh_token) throw new Error(JSON.stringify(tokens).slice(0, 300))
      writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
      chmodSync(TOKEN_PATH, 0o600)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>Hermes: Gmail connected. You can close this tab.</h2>')
      console.log(`Token saved to ${TOKEN_PATH}`)
      setTimeout(() => process.exit(0), 500)
    } catch (err) {
      res.writeHead(500).end('Token exchange failed')
      console.error('Token exchange failed:', String(err).slice(0, 300))
      setTimeout(() => process.exit(1), 500)
    }
  })
})

setTimeout(() => {
  console.error('Timed out waiting for consent (5 min).')
  process.exit(1)
}, 5 * 60 * 1000)
