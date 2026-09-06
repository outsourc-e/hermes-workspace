/**
 * GET /api/projects/worktrees
 *
 * Returns CliniTrack-Suite worktree status via SSH from home PC.
 * Uses the non-root user since root SSH is blocked.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

type Worktree = {
  path: string
  branch: string
  status: 'clean' | 'dirty' | 'unknown'
  ahead: number
  behind: number
}

export const Route = createFileRoute('/api/projects/worktrees')({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Run git status across all worktrees using the non-root user
          const { execSync } = await import('node:child_process')

          const base =
            '/home/nick-weiland-oc381816/Projects/Praxentis/active/CliniTrack'

          // List worktree directories
          let worktreeDirs: Array<string> = []
          try {
            const out = execSync(
              `ssh -i /root/.ssh/home_pc_key -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@100.92.120.31 'ls -d ${base}/tadc-* ${base}/wt-* ${base}/tadc-*/*/ 2>/dev/null | grep -E "(tadc|wt)" | head -20'`,
              { timeout: 15000 },
            )
            worktreeDirs = out.toString().trim().split('\n').filter(Boolean)
          } catch {
            return json(
              { error: 'Cannot reach home PC — are you on Tailscale?' },
              { status: 503 },
            )
          }

          const results: Array<Worktree> = []

          for (const dir of worktreeDirs) {
            try {
              const gitDir = `${dir}/.git`
              // Check if it's a valid git worktree
              const info = execSync(
                `ssh -i /root/.ssh/home_pc_key -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@100.92.120.31 'cd "${dir}" 2>/dev/null && git rev-parse --is-inside-work-tree 2>/dev/null && git branch --show-current 2>/dev/null && git status --porcelain 2>/dev/null | wc -l'`,
                { timeout: 10000 },
              )
                .toString()
                .trim()
                .split('\n')

              if (info[0] !== 'true') continue

              const branch = info[1] || 'unknown'
              const dirtyCount = parseInt(info[2] || '0', 10)
              const status: Worktree['status'] =
                dirtyCount > 0 ? 'dirty' : 'clean'

              // Get ahead/behind
              let ahead = 0,
                behind = 0
              try {
                const rev = execSync(
                  `ssh -i /root/.ssh/home_pc_key -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@100.92.120.31 'cd "${dir}" && git rev-list --left-right --count '@{upstream}...HEAD' 2>/dev/null'`,
                  { timeout: 8000 },
                )
                  .toString()
                  .trim()
                const parts = rev.split('\t')
                ahead = parseInt(parts[0] || '0', 10)
                behind = parseInt(parts[1] || '0', 10)
              } catch {
                /* upstream may not exist */
              }

              results.push({ path: dir, branch, status, ahead, behind })
            } catch {
              // Skip invalid worktrees
            }
          }

          return json(results)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          return json({ error: msg }, { status: 500 })
        }
      },
    },
  },
})
