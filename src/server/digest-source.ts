/**
 * Surfaces the most recent daily digest from
 * `~/.hermes/repos/nw-personal-projects/digests/` for the dashboard.
 *
 * Each digest is a markdown file named `YYYY-MM-DD.md` whose first
 * `## Summary` section lists bullets for Weather / Calendar / Email /
 * Slack / Whoop / Sentry / Engineering. We pick the newest file by
 * filename sort (lex == chronological for ISO dates) and extract a few
 * structured metrics from the Summary bullets. Free-text fallbacks
 * preserve the original bullet line so the UI can render the digest's
 * own wording when a precise integer isn't present.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_DIGEST_DIR = path.join(
  process.env.HOME || '/root',
  '.hermes/repos/nw-personal-projects/digests',
)

export type DigestSummary = {
  date: string
  filePath: string
  /** Integer when the bullet contains a numeric count, else null. */
  emailUnread: number | null
  /** "20+" type prefix we couldn't normalise; raw bullet line otherwise. */
  emailNote: string | null
  calendarEvents: number | null
  calendarNote: string | null
  slackMentions: number | null
  slackNote: string | null
  /** First paragraph of "## Summary", trimmed, with bullets flattened. */
  summaryHeadline: string | null
}

const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/

export async function findLatestDigestFile(
  dir: string = DEFAULT_DIGEST_DIR,
): Promise<{ filePath: string; date: string } | null> {
  let entries: Array<string>
  try {
    entries = await fs.readdir(dir)
  } catch {
    return null
  }
  const dated = entries
    .map((name) => {
      const m = name.match(FILE_PATTERN)
      return m ? { name, date: m[1] } : null
    })
    .filter((e): e is { name: string; date: string } => e !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const newest = dated[0]

  return { filePath: path.join(dir, newest.name), date: newest.date }
}

function extractSummarySection(markdown: string): string | null {
  const lines = markdown.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s+summary\s*$/i.test(lines[i].trim())) {
      start = i + 1
      break
    }
  }
  if (start === -1) return null
  const out: Array<string> = []
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^##\s+/.test(line)) break
    out.push(line)
  }
  return out.join('\n').trim() || null
}

function findBullet(section: string, label: RegExp): string | null {
  const lines = section.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line.startsWith('-')) continue
    const body = line.replace(/^[-*]\s*/, '')
    const m = body.match(label)
    if (m) return body
  }
  return null
}

function parseIntCount(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? Math.round(n) : null
}

export async function readLatestDigest(
  dir: string = DEFAULT_DIGEST_DIR,
): Promise<DigestSummary | null> {
  const located = await findLatestDigestFile(dir)
  if (!located) return null
  let raw: string
  try {
    raw = await fs.readFile(located.filePath, 'utf-8')
  } catch {
    return null
  }
  const section = extractSummarySection(raw)
  if (!section) {
    return {
      date: located.date,
      filePath: located.filePath,
      emailUnread: null,
      emailNote: null,
      calendarEvents: null,
      calendarNote: null,
      slackMentions: null,
      slackNote: null,
      summaryHeadline: null,
    }
  }

  const emailBullet = findBullet(section, /\*\*?email\*\*?/i)
  const calendarBullet = findBullet(section, /\*\*?calendar\*\*?/i)
  const slackBullet = findBullet(section, /\*\*?slack\*\*?/i)

  const slackMentions = (() => {
    if (!slackBullet) return null
    if (/no\s+(dm|mention|@-?mention)/i.test(slackBullet)) return 0
    return parseIntCount(slackBullet)
  })()

  const calendarEvents = (() => {
    if (!calendarBullet) return null
    if (/no\s+events?/i.test(calendarBullet)) return 0
    return parseIntCount(calendarBullet)
  })()

  const firstParagraph = section
    .split(/\n\s*\n/)[0]
    .replace(/\n\s*/g, ' ')
    .trim()

  return {
    date: located.date,
    filePath: located.filePath,
    emailUnread: emailBullet ? parseIntCount(emailBullet) : null,
    emailNote: emailBullet,
    calendarEvents,
    calendarNote: calendarBullet,
    slackMentions,
    slackNote: slackBullet,
    summaryHeadline: firstParagraph || null,
  }
}
