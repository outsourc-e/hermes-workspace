// Agora real-presence WebSocket server.
//
// Attaches to the workspace http server on the /api/agora-ws path. Keeps an
// in-memory room of connected peers and relays presence (position/facing) and
// chat between them. Presence is ephemeral — no database. Auth: the same
// claude-auth cookie the rest of the workspace uses (skipped when password
// protection is disabled, matching the app's isAuthenticated behavior).
import { WebSocketServer } from 'ws'

const AGORA_PATH = '/api/agora-ws'
const MOVE_THROTTLE_MS = 40 // server drops moves faster than ~25/s per peer

/**
 * @param {import('node:http').Server} httpServer
 * @param {(cookieHeader: string | undefined) => boolean} isAuthed
 */
export function attachAgoraPresence(httpServer, isAuthed) {
  const wss = new WebSocketServer({ noServer: true })
  /** @type {Map<string, {ws: import('ws').WebSocket, peer: any, lastMoveAt: number}>} */
  const clients = new Map()

  function broadcast(obj, exceptId) {
    const data = JSON.stringify(obj)
    for (const [id, c] of clients) {
      if (id === exceptId) continue
      if (c.ws.readyState === c.ws.OPEN) {
        try {
          c.ws.send(data)
        } catch {
          /* drop */
        }
      }
    }
  }

  function roster() {
    return [...clients.values()].map((c) => c.peer).filter(Boolean)
  }

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = ''
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      pathname = req.url || ''
    }
    if (pathname !== AGORA_PATH) return // let other upgrade handlers deal with it

    if (!isAuthed(req.headers.cookie)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    const connId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    clients.set(connId, { ws, peer: null, lastMoveAt: 0 })

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      const entry = clients.get(connId)
      if (!entry) return

      if (msg.type === 'hello' && msg.profile) {
        // Peer identity = the connection id (authoritative), profile is theirs.
        entry.peer = {
          id: connId,
          profile: msg.profile,
          x: clampNum(msg.x, 0, 4000, 600),
          y: clampNum(msg.y, 0, 4000, 360),
          facing: pickFacing(msg.facing),
          isMoving: false,
        }
        // Send the newcomer the current roster, then announce them to others.
        ws.send(JSON.stringify({ type: 'roster', peers: roster(), youId: connId }))
        broadcast({ type: 'join', peer: entry.peer }, connId)
        return
      }

      if (!entry.peer) return

      if (msg.type === 'move') {
        const now = Date.now()
        if (now - entry.lastMoveAt < MOVE_THROTTLE_MS) return
        entry.lastMoveAt = now
        entry.peer.x = clampNum(msg.x, 0, 4000, entry.peer.x)
        entry.peer.y = clampNum(msg.y, 0, 4000, entry.peer.y)
        entry.peer.facing = pickFacing(msg.facing)
        entry.peer.isMoving = Boolean(msg.isMoving)
        broadcast(
          {
            type: 'move',
            id: connId,
            x: entry.peer.x,
            y: entry.peer.y,
            facing: entry.peer.facing,
            isMoving: entry.peer.isMoving,
          },
          connId,
        )
        return
      }

      if (msg.type === 'chat' && typeof msg.body === 'string') {
        const body = msg.body.slice(0, 280)
        if (!body.trim()) return
        broadcast({ type: 'chat', id: connId, body }, connId)
        return
      }

      if (msg.type === 'profile' && msg.profile) {
        entry.peer.profile = msg.profile
        broadcast({ type: 'profile', id: connId, profile: msg.profile }, connId)
        return
      }
    })

    const drop = () => {
      clients.delete(connId)
      broadcast({ type: 'leave', id: connId })
    }
    ws.on('close', drop)
    ws.on('error', drop)
  })

  return wss
}

function clampNum(v, min, max, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function pickFacing(f) {
  return f === 'up' || f === 'down' || f === 'left' || f === 'right'
    ? f
    : 'down'
}
