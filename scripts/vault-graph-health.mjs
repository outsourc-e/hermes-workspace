#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_VAULT =
  process.platform === 'win32'
    ? 'C:\\Users\\taylo\\Documents\\unified-vault'
    : path.resolve(process.cwd(), '..', 'unified-vault')

const PLANET_CONCEPTS = [
  {
    title: 'Nova',
    project: 'nova',
    keywords: ['nova', 'hermes persona', 'soul sync', 'memory keeper'],
  },
  {
    title: 'Nova Mission Control',
    project: 'nova-mission-control',
    keywords: ['mission control', 'dashboard', 'cockpit', 'agentos', 'jarvis'],
  },
  {
    title: 'Hermes Agent',
    project: 'hermes',
    keywords: ['hermes', 'hermes agent', 'hermes workspace', 'gateway'],
  },
  {
    title: 'Obsidian Vault',
    project: 'unified-vault',
    keywords: ['obsidian', 'vault', 'graph', 'galaxy', 'wikilink', 'wiki'],
  },
  {
    title: 'Neon Moon Job Board',
    project: 'neon-moon',
    keywords: ['job board', 'printavo', 'kanban', 'neon moon', 'jobs'],
  },
  {
    title: 'Taylor Personal Kanban',
    project: 'taylor-ops',
    keywords: ['personal kanban', 'taylor kanban', 'task board', 'daily board'],
  },
  {
    title: 'Gmail Calendar Integration',
    project: 'integrations',
    keywords: ['gmail', 'calendar', 'google auth', 'email', 'oauth'],
  },
  {
    title: 'Claude Desktop Operator',
    project: 'agent-infrastructure',
    keywords: ['claude desktop', 'claude code', 'one-line prompt', 'operator'],
  },
  {
    title: 'Codex',
    project: 'agent-infrastructure',
    keywords: ['codex', 'gpt', 'repo', 'pull request', 'build'],
  },
  {
    title: 'LoomOS',
    project: 'loomos',
    keywords: ['loomos', 'loom os', 'quote builder', 'print shop os'],
  },
  {
    title: 'Design Intake',
    project: 'neon-moon',
    keywords: ['design intake', 'invoice', 'vector tracing', 'digitizing'],
  },
  {
    title: 'Cost Route Watch',
    project: 'agent-infrastructure',
    keywords: [
      'route cost',
      'nous portal',
      'quota',
      'gpt-5.5 burn',
      'cost route',
    ],
  },
  {
    title: 'NotebookLM Bridge',
    project: 'nova-mission-control',
    keywords: ['notebooklm', 'synthesis bridge', 'audio overview', 'mind map'],
  },
  {
    title: 'External Workflow Intake',
    project: 'agent-infrastructure',
    keywords: ['external workflow', 'workflow intake', 'handoff', 'inbox'],
  },
  {
    title: 'Morning Command Center',
    project: 'taylor-ops',
    keywords: ['morning command', 'morning ramp', 'daily check', 'home mode'],
  },
  {
    title: 'Job Board Caretaker',
    project: 'neon-moon',
    keywords: ['job board caretaker', 'job board', 'printavo', 'jobs'],
  },
  {
    title: 'Email Triage',
    project: 'integrations',
    keywords: ['email triage', 'gmail', 'inbox', 'needs reply'],
  },
  {
    title: 'Family Boundary System',
    project: 'taylor-ops',
    keywords: ['family boundary', 'home mode', 'family time', 'evening'],
  },
  {
    title: 'Web Agency',
    project: 'web-agency',
    keywords: ['web agency', 'client site', 'website', 'agency'],
  },
]

const MOCS = [
  {
    title: 'Nova - Map',
    project: 'nova',
    concepts: ['Nova', 'Hermes Agent', 'Nova Mission Control'],
  },
  {
    title: 'Mission Control - Map',
    project: 'nova-mission-control',
    concepts: ['Nova Mission Control', 'NotebookLM Bridge', 'Obsidian Vault'],
  },
  {
    title: 'Neon Moon Ops - Map',
    project: 'neon-moon',
    concepts: ['Neon Moon Job Board', 'Design Intake', 'Job Board Caretaker'],
  },
  {
    title: 'LoomOS - Map',
    project: 'loomos',
    concepts: ['LoomOS', 'Design Intake', 'Web Agency'],
  },
  {
    title: 'Automation Systems - Map',
    project: 'agent-infrastructure',
    concepts: ['Hermes Agent', 'Cost Route Watch', 'External Workflow Intake'],
  },
  {
    title: 'Taylor Ops - Map',
    project: 'taylor-ops',
    concepts: [
      'Taylor Personal Kanban',
      'Morning Command Center',
      'Family Boundary System',
    ],
  },
  {
    title: 'Agent Infrastructure - Map',
    project: 'agent-infrastructure',
    concepts: ['Claude Desktop Operator', 'Codex', 'Hermes Agent'],
  },
  {
    title: 'External Workflow Intake - Map',
    project: 'agent-infrastructure',
    concepts: [
      'External Workflow Intake',
      'Gmail Calendar Integration',
      'Email Triage',
    ],
  },
]

const BACKLINK_RULES = [
  {
    link: 'Gmail Calendar Integration',
    also: ['Email Triage'],
    terms: ['gmail', 'calendar', 'email'],
    reason: 'Gmail/email/calendar operational note',
  },
  {
    link: 'Neon Moon Job Board',
    also: ['Taylor Personal Kanban'],
    terms: ['job board', 'kanban', 'printavo'],
    reason: 'Job board, Printavo, or kanban work',
  },
  {
    link: 'Nova Mission Control',
    terms: ['mission control', 'dashboard', 'agentos', 'jarvis', 'cockpit'],
    reason: 'Mission Control dashboard/cockpit work',
  },
  {
    link: 'Claude Desktop Operator',
    terms: ['claude desktop', 'claude code', 'one-line prompt'],
    reason: 'Claude desktop/operator workflow',
  },
  {
    link: 'Codex',
    terms: ['codex', 'gpt', 'repo', 'pr ', 'pull request', 'build'],
    reason: 'Codex implementation or repo work',
  },
  {
    link: 'Obsidian Vault',
    terms: ['obsidian', 'vault', 'graph', 'galaxy', 'wiki', 'memory'],
    reason: 'Vault, graph, galaxy, or memory work',
  },
  {
    link: 'Cost Route Watch',
    terms: [
      'route cost',
      'nous portal',
      'openai codex quota',
      'gpt-5.5 burn',
      'quota',
    ],
    reason: 'Model route, quota, or cost watch',
  },
  {
    link: 'Design Intake',
    terms: ['design intake', 'invoice', 'vector tracing', 'digitizing'],
    reason: 'Design intake and production art workflow',
  },
]

const args = parseArgs(process.argv.slice(2))
const vaultRoot = path.resolve(args.vault || DEFAULT_VAULT)
const outDir = path.resolve(
  args.out || path.join(vaultRoot, 'agents', 'gpt', 'graph-health'),
)
const applyMode = Boolean(args.apply)

if (applyMode) {
  console.error(
    'Apply mode is intentionally not implemented. This tool is report-only.',
  )
  process.exit(2)
}

const generatedAt = new Date().toISOString()
const outRel = toVaultPath(path.relative(vaultRoot, outDir))

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack || error.message : String(error),
  )
  process.exit(1)
})

async function main() {
  await assertDirectory(vaultRoot, 'vault')
  const files = await walkMarkdown(vaultRoot)
  const notes = await Promise.all(files.map((file) => readNote(file)))
  const graph = buildGraph(notes)
  const suggestions = buildSuggestions(graph)
  await writeOutputs(graph, suggestions)
  printSummary(graph, suggestions)
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--vault') parsed.vault = values[++index]
    else if (value === '--out') parsed.out = values[++index]
    else if (value === '--apply') parsed.apply = true
    else if (value === '--help' || value === '-h') {
      console.log(
        'Usage: node scripts/vault-graph-health.mjs [--vault PATH] [--out PATH]',
      )
      process.exit(0)
    }
  }
  return parsed
}

async function assertDirectory(dir, label) {
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat?.isDirectory())
    throw new Error(`Missing ${label} directory: ${dir}`)
}

async function walkMarkdown(root) {
  const results = []
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const rel = toVaultPath(path.relative(root, fullPath))
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, rel)) continue
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        if (rel.startsWith(`${outRel}/`)) continue
        results.push(fullPath)
      }
    }
  }
  await walk(root)
  return results.sort((a, b) => a.localeCompare(b))
}

function shouldSkipDir(name, rel) {
  return (
    name === '.git' ||
    name === '.obsidian' ||
    name === '.vault-meta' ||
    name === 'node_modules' ||
    name === 'dist' ||
    rel === outRel ||
    rel.startsWith(`${outRel}/`)
  )
}

async function readNote(fullPath) {
  const raw = await fs.readFile(fullPath, 'utf8')
  const stat = await fs.stat(fullPath)
  const relPath = toVaultPath(path.relative(vaultRoot, fullPath))
  const { frontmatter, content } = parseFrontmatter(raw)
  const fallbackTitle =
    titleFromContent(content) || path.basename(relPath, '.md')
  const title = asString(frontmatter.title) || fallbackTitle
  const tags = normalizeList(frontmatter.tags)
  const wikilinks = extractWikilinks(content)
  const wikilinkOccurrences = countWikilinkOccurrences(content)
  return {
    id: relPath,
    path: relPath,
    fullPath,
    title,
    folder: folderFor(relPath),
    frontmatter,
    type: asString(frontmatter.type),
    project: asString(frontmatter.project),
    state: asString(frontmatter.state),
    status: asString(frontmatter.status),
    tags,
    raw,
    content,
    contentLower: `${title}\n${content}`.toLowerCase(),
    wikilinks,
    wikilinkOccurrences,
    modified: stat.mtime.toISOString(),
    size: raw.length,
    missingFrontmatter: !raw.startsWith('---'),
  }
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { frontmatter: {}, content: raw }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, content: raw }
  return { frontmatter: parseYamlLite(match[1]), content: match[2] || '' }
}

function parseYamlLite(block) {
  const data = {}
  let activeKey = null
  for (const line of block.split(/\r?\n/)) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (listMatch && activeKey) {
      if (!Array.isArray(data[activeKey])) data[activeKey] = []
      data[activeKey].push(unquote(listMatch[1].trim()))
      continue
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    activeKey = match[1]
    const value = match[2].trim()
    if (!value) data[activeKey] = []
    else if (value.startsWith('[') && value.endsWith(']')) {
      data[activeKey] = value
        .slice(1, -1)
        .split(',')
        .map((item) => unquote(item.trim()))
        .filter(Boolean)
    } else {
      data[activeKey] = unquote(value)
    }
  }
  return data
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, '')
}

function titleFromContent(content) {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

function extractWikilinks(content) {
  const links = []
  const seen = new Set()
  const regex = /\[\[([^\]]+)\]\]/g
  let match = null
  while ((match = regex.exec(content))) {
    const clean = (match[1] || '').split('|')[0].split('#')[0].trim()
    if (clean && !seen.has(clean)) {
      seen.add(clean)
      links.push(clean)
    }
  }
  return links
}

function countWikilinkOccurrences(content) {
  let count = 0
  const regex = /\[\[([^\]]+)\]\]/g
  while (regex.exec(content)) count += 1
  return count
}

function buildGraph(notes) {
  const index = buildIndex(notes)
  const incoming = new Map(notes.map((note) => [note.id, new Set()]))
  const outgoing = new Map(notes.map((note) => [note.id, new Set()]))
  const edges = []
  let unresolvedLinkCount = 0

  for (const note of notes) {
    for (const target of note.wikilinks) {
      const resolved = resolveTarget(target, index)
      if (resolved) {
        outgoing.get(note.id)?.add(resolved.id)
        incoming.get(resolved.id)?.add(note.id)
        edges.push({
          source: note.id,
          target: resolved.id,
          label: target,
          resolved: true,
        })
      } else {
        unresolvedLinkCount += 1
        edges.push({ source: note.id, target, label: target, resolved: false })
      }
    }
  }

  const nodes = notes.map((note) => {
    const outgoingCount = outgoing.get(note.id)?.size ?? 0
    const incomingCount = incoming.get(note.id)?.size ?? 0
    const totalLinks = outgoingCount + incomingCount
    return {
      id: note.id,
      title: note.title,
      path: note.path,
      folder: note.folder,
      type: note.type,
      project: note.project,
      state: note.state,
      status: note.status,
      tags: note.tags,
      modified: note.modified,
      wikilinks: note.wikilinks,
      wikilinkOccurrences: note.wikilinkOccurrences,
      outgoingCount,
      incomingCount,
      totalLinks,
      sizeTier: tier(totalLinks),
      bodyType: 'note',
      missingFrontmatter: note.missingFrontmatter,
      excerpt: excerpt(note.content),
    }
  })

  const sortedByLinks = [...nodes].sort(sortByLinks)
  const core = sortedByLinks[0] || null
  if (core) core.bodyType = 'core'
  const planetCutoff = Math.max(
    3,
    sortedByLinks[Math.min(24, sortedByLinks.length - 1)]?.totalLinks || 3,
  )
  for (const node of nodes) {
    if (node.id === core?.id) continue
    if (node.totalLinks === 0) node.bodyType = 'comet'
    else if (node.totalLinks >= planetCutoff) node.bodyType = 'planet'
    else node.bodyType = 'tag'
  }

  const byFolder = countBy(notes, (note) => note.folder)
  const byType = countBy(notes, (note) => note.type || 'missing')
  const byProject = countBy(notes, (note) => note.project || 'missing')
  const byState = countBy(notes, (note) => note.state || 'missing')
  const byStatus = countBy(notes, (note) => note.status || 'missing')
  const byTag = new Map()
  for (const note of notes) {
    for (const tag of note.tags) byTag.set(tag, (byTag.get(tag) || 0) + 1)
  }

  return {
    generatedAt,
    vaultRoot,
    outputDir: outDir,
    notes,
    nodes,
    edges,
    incoming,
    outgoing,
    index,
    totals: {
      notes: notes.length,
      wikilinks: notes.reduce((sum, note) => sum + note.wikilinkOccurrences, 0),
      uniqueWikilinks: notes.reduce(
        (sum, note) => sum + note.wikilinks.length,
        0,
      ),
      notesWithWikilinks: notes.filter((note) => note.wikilinks.length > 0)
        .length,
      resolvedLinks: edges.filter((edge) => edge.resolved).length,
      unresolvedLinks: unresolvedLinkCount,
      orphans: nodes.filter((node) => node.totalLinks === 0).length,
      missingFrontmatter: notes.filter((note) => note.missingFrontmatter)
        .length,
    },
    counts: {
      byFolder: objectFromCountMap(byFolder),
      byType: objectFromCountMap(byType),
      byProject: objectFromCountMap(byProject),
      byState: objectFromCountMap(byState),
      byStatus: objectFromCountMap(byStatus),
      byTag: objectFromCountMap(byTag),
    },
    core,
  }
}

function buildIndex(notes) {
  const index = new Map()
  for (const note of notes) {
    for (const key of [
      note.id,
      note.id.replace(/\.md$/i, ''),
      path.basename(note.id, '.md'),
      note.title,
    ]) {
      const normalized = normalizeKey(key)
      if (!index.has(normalized)) index.set(normalized, note)
    }
  }
  return index
}

function resolveTarget(target, index) {
  return (
    index.get(normalizeKey(target)) ||
    index.get(normalizeKey(target.replace(/\.md$/i, ''))) ||
    index.get(normalizeKey(path.basename(target, '.md')))
  )
}

function buildSuggestions(graph) {
  const existingTitles = new Set(
    graph.notes.map((note) => normalizeKey(note.title)),
  )
  const conceptDrafts = PLANET_CONCEPTS.map((concept) => {
    const mature = graph.notes.find(
      (note) =>
        normalizeKey(note.title) === normalizeKey(concept.title) &&
        ['promoted', 'active', 'stable', 'evergreen'].includes(
          String(note.status || note.state || '').toLowerCase(),
        ),
    )
    const related = findRelated(graph.notes, concept.keywords, 12)
    return {
      ...concept,
      existingMaturePath: mature?.path,
      shouldDraft: !mature,
      relatedNotes: related.map(summaryNote),
      presentTitle: existingTitles.has(normalizeKey(concept.title)),
    }
  })

  const backlinkSuggestions = []
  for (const note of graph.notes) {
    for (const rule of BACKLINK_RULES) {
      const matchedTerms = rule.terms.filter((term) =>
        note.contentLower.includes(term),
      )
      if (matchedTerms.length === 0) continue
      const links = [rule.link, ...(rule.also || [])]
      const missingLinks = links.filter((link) => !hasWikiLink(note, link))
      if (missingLinks.length === 0) continue
      backlinkSuggestions.push({
        sourcePath: note.path,
        sourceTitle: note.title,
        suggestedLinks: missingLinks,
        reason: rule.reason,
        matchedTerms,
        confidence: matchedTerms.length > 1 ? 'high' : 'medium',
      })
    }
  }

  const mocSuggestions = MOCS.map((moc) => ({
    ...moc,
    relatedNotes: findRelated(graph.notes, moc.concepts, 16).map(summaryNote),
  }))

  const weakNotes = graph.nodes
    .filter((node) => node.totalLinks <= 1)
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, 75)

  const planetCandidates = graph.nodes
    .filter((node) => node.totalLinks >= 3)
    .sort(sortByLinks)
    .slice(0, 50)

  return {
    generatedAt,
    reportOnly: true,
    conceptDrafts,
    mocSuggestions,
    backlinkSuggestions: backlinkSuggestions.slice(0, 200),
    weakNotes,
    planetCandidates,
    orphanCandidates: graph.nodes
      .filter((node) => node.totalLinks === 0)
      .slice(0, 100),
  }
}

async function writeOutputs(graph, suggestions) {
  await fs.mkdir(outDir, { recursive: true })
  await fs.mkdir(path.join(outDir, 'planet-drafts'), { recursive: true })
  await fs.mkdir(path.join(outDir, 'moc-drafts'), { recursive: true })

  const graphNodes = {
    generatedAt,
    vaultRoot,
    nodes: graph.nodes.map(
      ({
        id,
        title,
        path,
        folder,
        type,
        project,
        status,
        tags,
        modified,
        incomingCount,
        outgoingCount,
        totalLinks,
        sizeTier,
        bodyType,
        excerpt,
      }) => ({
        id,
        title,
        path,
        folder,
        type,
        project,
        status,
        tags,
        modified,
        incomingCount,
        outgoingCount,
        totalLinks,
        sizeTier,
        bodyType,
        excerpt,
      }),
    ),
    links: graph.edges,
  }

  const graphHealth = {
    generatedAt,
    vaultRoot,
    outputDir: toVaultPath(path.relative(vaultRoot, outDir)),
    totals: graph.totals,
    counts: graph.counts,
    core: graph.core,
    topPlanets: suggestions.planetCandidates.slice(0, 25),
    weakAreas: suggestions.weakNotes.slice(0, 25),
    reportOnly: true,
  }

  const graphSuggestions = {
    generatedAt,
    reportOnly: true,
    backlinkSuggestions: suggestions.backlinkSuggestions,
    planetDrafts: suggestions.conceptDrafts,
    mocDrafts: suggestions.mocSuggestions,
    reviewRequired: [
      'All generated notes are drafts under agents/gpt/graph-health and are not canonical knowledge pages.',
      'Do not apply backlink edits without a separate explicit apply request and vault locking protocol.',
      'Promote or merge planet/MOC drafts only after human or Claude review.',
    ],
  }

  await fs.writeFile(
    path.join(outDir, 'graphNodes.json'),
    `${JSON.stringify(graphNodes, null, 2)}\n`,
  )
  await fs.writeFile(
    path.join(outDir, 'graphHealth.json'),
    `${JSON.stringify(graphHealth, null, 2)}\n`,
  )
  await fs.writeFile(
    path.join(outDir, 'graphSuggestions.json'),
    `${JSON.stringify(graphSuggestions, null, 2)}\n`,
  )

  const report = renderReport(graph, suggestions)
  await fs.writeFile(path.join(outDir, 'graphHealth.md'), report)
  await fs.writeFile(path.join(outDir, 'graph-health-report.md'), report)

  for (const concept of suggestions.conceptDrafts) {
    if (!concept.shouldDraft) continue
    const file = path.join(outDir, 'planet-drafts', `${slug(concept.title)}.md`)
    await fs.writeFile(file, renderPlanetDraft(concept))
  }

  for (const moc of suggestions.mocSuggestions) {
    const file = path.join(outDir, 'moc-drafts', `${slug(moc.title)}.md`)
    await fs.writeFile(file, renderMocDraft(moc))
  }
}

function renderReport(graph, suggestions) {
  const topFolders = tableRows(graph.counts.byFolder, 15)
  const topTypes = tableRows(graph.counts.byType, 12)
  const topProjects = tableRows(graph.counts.byProject, 12)
  const topPlanets = suggestions.planetCandidates.slice(0, 20)
  const backlinks = suggestions.backlinkSuggestions.slice(0, 60)
  const orphans = suggestions.orphanCandidates.slice(0, 40)

  return `---
title: Vault Graph Health Report
author: gpt
type: status
project: nova-mission-control
state: draft
created: ${generatedAt}
updated: ${generatedAt}
review_by: claude
status: draft
source: inference + vault scan
confidence: medium
tags: [graph-health, obsidian, nova-mission-control]
links: [[Obsidian Vault]], [[Nova Mission Control]], [[Nova]]
---

# Vault Graph Health Report

Report-only scan. No source notes were edited.

## Counts

- Markdown notes: ${graph.totals.notes}
- Wikilinks: ${graph.totals.wikilinks}
- Unique wikilink targets per note: ${graph.totals.uniqueWikilinks}
- Notes with wikilinks: ${graph.totals.notesWithWikilinks}
- Resolved links: ${graph.totals.resolvedLinks}
- Unresolved links: ${graph.totals.unresolvedLinks}
- Orphan candidates: ${graph.totals.orphans}
- Notes missing frontmatter: ${graph.totals.missingFrontmatter}
- Galactic core candidate: ${graph.core ? linkLine(graph.core) : 'none'}

## Folder Weight

${topFolders}

## Type Weight

${topTypes}

## Project Weight

${topProjects}

## High-Value Planet Candidates

${topPlanets.map((node) => `- [[${node.title}]] - ${node.totalLinks} links - ${node.path}`).join('\n') || '- none'}

## Weak Notes And Orphans

These are not bad notes. They are places where Mission Control needs context, backlinks, or intentional comet treatment.

${orphans.map((node) => `- ${node.title} - ${node.path}`).join('\n') || '- none'}

## Draft Planet Notes

${suggestions.conceptDrafts
  .map((concept) =>
    concept.shouldDraft
      ? `- Draft created: planet-drafts/${slug(concept.title)}.md`
      : `- Existing mature note found for [[${concept.title}]]: ${concept.existingMaturePath}`,
  )
  .join('\n')}

## Draft MOCs

${suggestions.mocSuggestions.map((moc) => `- Draft created: moc-drafts/${slug(moc.title)}.md`).join('\n')}

## Backlink Suggestions

${
  backlinks
    .map(
      (item) =>
        `- ${item.sourcePath} -> ${item.suggestedLinks.map((link) => `[[${link}]]`).join(', ')} (${item.reason}; terms: ${item.matchedTerms.join(', ')})`,
    )
    .join('\n') || '- none'
}

## Mission Control Data

- graphHealth.json
- graphHealth.md
- graphNodes.json
- graphSuggestions.json

## Safe Next Steps

- Review planet and MOC drafts before promotion.
- Wire Mission Control to prefer graphNodes.json for whole-vault shape and graphHealth.json for counters.
- Use graphSuggestions.json as a review queue, not an auto-editor.
- Keep knowledge/ edits behind the wiki lock protocol only.
`
}

function renderPlanetDraft(concept) {
  return `---
title: ${concept.title}
author: gpt
type: reference
project: ${concept.project}
state: draft
created: ${generatedAt}
updated: ${generatedAt}
review_by: claude
status: draft
source: inference + vault scan
confidence: medium
tags: [planet-draft, graph-health]
links: [${concept.relatedNotes
    .slice(0, 6)
    .map((note) => `[[${note.title}]]`)
    .join(', ')}]
---

# ${concept.title}

Draft planet note generated for graph review. This is not canonical until reviewed and promoted.

## Why This Planet Exists

The vault scan found recurring signals for: ${concept.keywords.join(', ')}.

## Related Notes Found

${concept.relatedNotes.map((note) => `- [[${note.title}]] - ${note.path}`).join('\n') || '- none found'}

## Suggested Backlinks

- Search notes matching ${concept.keywords.map((item) => `"${item}"`).join(', ')} and consider linking them here.

## Review Notes

- Merge into an existing mature note if one already represents this concept.
- Promote only after human or Claude review.
`
}

function renderMocDraft(moc) {
  return `---
title: ${moc.title}
author: gpt
type: reference
project: ${moc.project}
state: draft
created: ${generatedAt}
updated: ${generatedAt}
review_by: claude
status: draft
source: inference + vault scan
confidence: medium
tags: [moc-draft, graph-health]
links: [${moc.concepts.map((concept) => `[[${concept}]]`).join(', ')}]
---

# ${moc.title}

Draft map-of-content generated for graph review. This note should become a navigational index only after review.

## Core Planets

${moc.concepts.map((concept) => `- [[${concept}]]`).join('\n')}

## Related Notes Found

${moc.relatedNotes.map((note) => `- [[${note.title}]] - ${note.path}`).join('\n') || '- none found'}

## Review Notes

- Keep this as a map, not a status log.
- Promote only after duplicate checks and source review.
`
}

function printSummary(graph, suggestions) {
  console.log(
    JSON.stringify(
      {
        generatedAt,
        vaultRoot,
        outDir,
        totals: graph.totals,
        planetDrafts: suggestions.conceptDrafts.filter(
          (concept) => concept.shouldDraft,
        ).length,
        mocDrafts: suggestions.mocSuggestions.length,
        backlinkSuggestions: suggestions.backlinkSuggestions.length,
      },
      null,
      2,
    ),
  )
}

function findRelated(notes, keywords, limit) {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase())
  return notes
    .map((note) => {
      const titleHits = normalizedKeywords.filter((keyword) =>
        note.title.toLowerCase().includes(keyword),
      ).length
      const bodyHits = normalizedKeywords.filter((keyword) =>
        note.contentLower.includes(keyword),
      ).length
      return {
        note,
        score: titleHits * 5 + bodyHits + note.wikilinks.length * 0.05,
      }
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.note.modified.localeCompare(a.note.modified),
    )
    .slice(0, limit)
    .map((item) => item.note)
}

function hasWikiLink(note, title) {
  return note.wikilinks.some(
    (link) => normalizeKey(link) === normalizeKey(title),
  )
}

function countBy(items, getKey) {
  const counts = new Map()
  for (const item of items) {
    const key = getKey(item) || 'missing'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function objectFromCountMap(map) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  )
}

function tableRows(object, limit) {
  const rows = Object.entries(object).slice(0, limit)
  if (rows.length === 0) return '- none'
  return rows.map(([key, count]) => `- ${key}: ${count}`).join('\n')
}

function normalizeList(input) {
  if (Array.isArray(input))
    return input
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
  if (typeof input === 'string')
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  return []
}

function asString(value) {
  if (value == null || Array.isArray(value)) return undefined
  const result = String(value).trim()
  return result || undefined
}

function folderFor(relPath) {
  const parts = relPath.split('/').filter(Boolean)
  if (parts[0] === 'agents' && parts[1]) return `${parts[0]}/${parts[1]}`
  return parts[0] || 'vault'
}

function normalizeKey(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
}

function toVaultPath(value) {
  return value.replace(/\\/g, '/')
}

function tier(value) {
  if (value >= 50) return 5
  if (value >= 20) return 4
  if (value >= 8) return 3
  if (value >= 3) return 2
  return 1
}

function sortByLinks(a, b) {
  return (
    b.totalLinks - a.totalLinks ||
    b.incomingCount - a.incomingCount ||
    a.title.localeCompare(b.title)
  )
}

function excerpt(content) {
  return content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function summaryNote(note) {
  return {
    title: note.title,
    path: note.path,
    folder: note.folder,
    type: note.type,
    project: note.project,
    status: note.status,
    modified: note.modified,
  }
}

function linkLine(node) {
  return `[[${node.title}]] - ${node.totalLinks} links - ${node.path}`
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
