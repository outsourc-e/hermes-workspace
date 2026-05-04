/**
 * Animated p5js-flavored hero canvas for the Playground title screen.
 * Vanilla 2D canvas, no deps, ~60fps, draws an orbiting "Hermes"
 * caduceus ring of particles + a soft starfield.
 */
import { useEffect, useRef } from 'react'

export function PlaygroundHeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let mounted = true
    let w = 0
    let h = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const stars: Array<{ x: number; y: number; r: number; tw: number }> = []
    for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.2, tw: Math.random() * Math.PI * 2 })

    const orbiters: Array<{ phase: number; orbit: number; speed: number; size: number; color: string }> = []
    // Gold-warm palette to match HermesWorld branding
    const palette = ['#facc15', '#fbbf24', '#fde68a', '#22d3ee', '#a78bfa', '#fb7185', '#34d399']
    for (let i = 0; i < 42; i++) orbiters.push({ phase: Math.random() * Math.PI * 2, orbit: 0.18 + Math.random() * 0.22, speed: 0.4 + Math.random() * 0.5, size: 1.5 + Math.random() * 2.4, color: palette[Math.floor(Math.random() * palette.length)] })

    // Agent network nodes — fixed positions on the ring, connected with thin lines.
    const agentNodes: Array<{ a: number; r: number; color: string }> = []
    const agentColors = ['#facc15', '#22d3ee', '#a78bfa', '#34d399', '#fb7185', '#fbbf24']
    for (let i = 0; i < 6; i++) agentNodes.push({ a: (i / 6) * Math.PI * 2, r: 1.0, color: agentColors[i] })

    let t = 0
    const draw = () => {
      if (!mounted) return
      t += 0.008
      // Background
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, Math.max(w, h) * 0.9)
      g.addColorStop(0, '#0d1d2c')
      g.addColorStop(0.45, '#0a121e')
      g.addColorStop(1, '#06080f')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // Stars
      for (const s of stars) {
        const x = s.x * w
        const y = s.y * h
        const tw = 0.55 + (Math.sin(t * 2 + s.tw) + 1) * 0.225
        ctx.fillStyle = `rgba(207, 231, 240, ${tw})`
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Center caduceus ring
      const cx = w / 2
      const cy = h * 0.48
      const baseR = Math.min(w, h) * 0.32
      ctx.save()
      ctx.translate(cx, cy)
      ctx.strokeStyle = 'rgba(34,211,238,0.22)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(0, 0, baseR, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(167,139,250,0.18)'
      ctx.beginPath()
      ctx.arc(0, 0, baseR * 0.78, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(251,191,36,0.18)'
      ctx.beginPath()
      ctx.arc(0, 0, baseR * 1.18, 0, Math.PI * 2)
      ctx.stroke()

      // Orbiters
      for (const o of orbiters) {
        const a = t * o.speed + o.phase
        const r = baseR * (0.9 + Math.sin(t * 0.7 + o.phase) * o.orbit)
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r * 0.7 // squash for iso feel
        const grad = ctx.createRadialGradient(x, y, 0, x, y, o.size * 6)
        grad.addColorStop(0, o.color)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, o.size * 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 0.85
        ctx.beginPath()
        ctx.arc(x, y, o.size * 0.55, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Agent network: 6 fixed nodes connected through center, slow rotation.
      const netRot = t * 0.08
      const nodePts = agentNodes.map((n) => ({
        x: Math.cos(n.a + netRot) * baseR * n.r,
        y: Math.sin(n.a + netRot) * baseR * n.r * 0.7,
        color: n.color,
      }))
      // Edges: every node to every other (sparse), with golden tint.
      ctx.lineWidth = 0.7
      for (let i = 0; i < nodePts.length; i++) {
        for (let j = i + 1; j < nodePts.length; j++) {
          const a = nodePts[i]
          const b = nodePts[j]
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
          grad.addColorStop(0, `${a.color}55`)
          grad.addColorStop(1, `${b.color}55`)
          ctx.strokeStyle = grad
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
      // Nodes themselves
      for (const n of nodePts) {
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14)
        grad.addColorStop(0, n.color)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(n.x, n.y, 14, 0, Math.PI * 2)
        ctx.fill()
      }

      // Inner orb (now warm gold)
      const orb = ctx.createRadialGradient(0, 0, 8, 0, 0, baseR * 0.55)
      orb.addColorStop(0, 'rgba(250, 204, 21, 0.7)')
      orb.addColorStop(0.4, 'rgba(250, 204, 21, 0.16)')
      orb.addColorStop(1, 'rgba(250, 204, 21, 0)')
      ctx.fillStyle = orb
      ctx.beginPath()
      ctx.arc(0, 0, baseR * 0.55, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => {
      mounted = false
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      aria-hidden
    />
  )
}
