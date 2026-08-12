#!/usr/bin/env node
/**
 * Sync ~/.hermes/profiles/<workerId>/ from swarm.yaml roster fields.
 * Updates config.yaml (model + toolsets), SOUL.md, and memory/IDENTITY.md.
 *
 * learning profile: preserves agents/learning/SOUL.md base persona and appends
 * swarm role extension; toolsets are merged (union), not replaced.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'yaml'

const WS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const PROFILES = path.join(os.homedir(), '.hermes', 'profiles')
const SWARM_SOUL_BEGIN = '<!-- SWARM_ROLE_EXTENSION -->'
const SWARM_SOUL_END = '<!-- /SWARM_ROLE_EXTENSION -->'
const swarm = yaml.parse(fs.readFileSync(path.join(WS, 'swarm.yaml'), 'utf8'))

function parseModel(label) {
  if (!label) return null
  const i = label.indexOf('/')
  if (i <= 0) return null
  return { provider: label.slice(0, i), default: label.slice(i + 1) }
}

function mergeToolsets(existing, swarmTools) {
  return [...new Set([...(existing ?? []), ...(swarmTools ?? [])])]
}

function renderIdentity(w) {
  const name = w.name?.trim() || w.id
  const role = w.role?.trim() || 'Worker'
  const specialty = w.specialty?.trim() || 'General execution'
  const model = w.model?.trim() || 'Unspecified'
  const mission = w.mission?.trim() || 'Execute assigned swarm work and checkpoint progress.'
  const skills = w.skills?.length ? w.skills.join(', ') : 'swarm-worker-core'
  const capabilities = w.capabilities?.length ? w.capabilities.join(', ') : 'not declared'
  const lines = [
    `# IDENTITY.md — ${name}`,
    '',
    `- Name: ${name}`,
    `- Worker ID: ${w.id}`,
    `- Role: ${role}`,
    `- Specialty: ${specialty}`,
    `- Mission: ${mission}`,
    `- Skills: ${skills}`,
    `- Capabilities: ${capabilities}`,
    `- Model: ${model}`,
    '',
    '## Job description',
    `${name} is the ${role} lane. ${mission}`,
    '',
  ]

  if (w.id === 'learning') {
    lines.push(
      '## Additional profile modes',
      '',
      '- **Learning tutor**: deep-learning mentor persona in `SOUL.md` (Feynman-first, Socratic, knowledge capture).',
      '- **Swarm retrospective**: when dispatched by LangGraph orchestrator, follow the swarm extension in `SOUL.md`.',
      '',
    )
  }

  lines.push(
    'The worker ID is a stable machine identifier only; user-facing surfaces should prefer Name — Role.',
    '',
  )
  return lines.join('\n')
}

function renderSwarmSoulExtension(w) {
  const name = w.name?.trim() || w.id
  const modes = w.modes?.length ? w.modes.join(', ') : 'none'
  const greenlight = w.greenlightRequiredFor?.length
    ? w.greenlightRequiredFor.map((g) => `- ${g}: Requires human approval`).join('\n')
    : '- none declared'

  return [
    `## Swarm 角色扩展 · ${name}`,
    '',
    '当由 Swarm / LangGraph 编排派发时，在保留上方 Learning Profile 教学能力的前提下，额外承担以下职责。',
    '',
    '### Role',
    w.role?.trim() || 'Worker',
    '',
    '### Mission',
    w.mission?.trim() || '',
    '',
    '### Specialty',
    w.specialty?.trim() || '',
    '',
    '### Modes',
    modes,
    '',
    '### Greenlight Rules',
    greenlight,
    '',
    '### Swarm checkpoint 格式',
    '- STATE, FILES_CHANGED, COMMANDS_RUN, RESULT, BLOCKER, NEXT_ACTION',
    '- 将可复用结论写入 `~/wiki`（`llm-wiki`）；mission 产物在 `memory/swarm/missions/<missionId>/`',
    '- Wiki 摄入：调用 `learning-wiki-ingest` skill（`hermes -p learning chat -q \"learning-wiki-ingest missionId=<id>\"`）',
    '- `publish` 需人工 greenlight',
    '',
  ].join('\n')
}

function renderSoul(w) {
  const name = w.name?.trim() || w.id
  const modes = w.modes?.length ? w.modes.join(', ') : 'none'
  const greenlight = w.greenlightRequiredFor?.length
    ? w.greenlightRequiredFor.map((g) => `- ${g}: Requires human approval`).join('\n')
    : '- none declared'

  const prohibitedById = {
    orchestrator: [
      'Implement code (developer)',
      'Collect primary research facts (researcher)',
      'Make technical architecture decisions (architect)',
    ],
    researcher: [
      'Strategy judgments, recommendations, or direction choices',
      'Architecture or implementation decisions',
      'Publishing externally without greenlight',
    ],
    architect: [
      'Primary fact gathering (researcher)',
      'Writing implementation code (developer)',
      'Business strategy beyond technical scope',
    ],
    developer: [
      'Changing architecture (architect)',
      'Making design decisions (architect)',
      'Skipping tests',
    ],
  }
  const prohibited = prohibitedById[w.id] ?? []
  const prohibBlock = prohibited.length
    ? `\n## Prohibited\n\n${prohibited.map((p) => `- ${p}`).join('\n')}\n`
    : ''

  return [
    `# ${name}`,
    '',
    '## Role',
    w.role?.trim() || 'Worker',
    '',
    '## Mission',
    w.mission?.trim() || '',
    '',
    '## Specialty',
    w.specialty?.trim() || '',
    '',
    '## Modes',
    modes,
    prohibBlock,
    '## Greenlight Rules',
    greenlight,
    '',
    '## Communication Style',
    '- Structured checkpoints: STATE, FILES_CHANGED, COMMANDS_RUN, RESULT, BLOCKER, NEXT_ACTION',
    '- Stay within role boundaries defined in swarm.yaml and profile skills',
    '',
  ].join('\n')
}

function stripSwarmSoulExtension(content) {
  const re = new RegExp(
    `\\n*${SWARM_SOUL_BEGIN}[\\s\\S]*?${SWARM_SOUL_END}\\n*`,
    'g',
  )
  return content.replace(re, '').trimEnd()
}

function mergeLearningSoul(w, profileDir) {
  const basePath = path.join(WS, 'agents', 'learning', 'SOUL.md')
  const soulPath = path.join(profileDir, 'SOUL.md')
  let base = ''
  if (fs.existsSync(basePath)) {
    base = fs.readFileSync(basePath, 'utf8').trimEnd()
  } else if (fs.existsSync(soulPath)) {
    base = stripSwarmSoulExtension(fs.readFileSync(soulPath, 'utf8'))
  }
  const extension = renderSwarmSoulExtension(w)
  return `${base}\n\n${SWARM_SOUL_BEGIN}\n\n${extension}\n\n${SWARM_SOUL_END}\n`
}

function syncSwarmSkills(w, profileDir) {
  const wsSkills = path.join(WS, 'skills', 'swarm')
  const profileSkills = path.join(profileDir, 'skills')
  fs.mkdirSync(profileSkills, { recursive: true })

  for (const skill of w.skills ?? []) {
    const localCore = path.join(wsSkills, skill)
    const dest = path.join(profileSkills, skill)
    if (!fs.existsSync(localCore)) continue
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(localCore, dest, { recursive: true })
  }
}

/** ~/.hermes/skills/swarm/ — canonical path for /slash-skill discovery (skill_view). */
function syncGlobalSwarmSkills(swarmWorkers) {
  const wsSkills = path.join(WS, 'skills', 'swarm')
  const globalSwarm = path.join(os.homedir(), '.hermes', 'skills', 'swarm')
  const globalRoot = path.join(os.homedir(), '.hermes', 'skills')
  const names = new Set()
  for (const w of swarmWorkers) {
    for (const skill of w.skills ?? []) names.add(skill)
  }
  fs.mkdirSync(globalSwarm, { recursive: true })
  let synced = 0
  for (const skill of names) {
    const src = path.join(wsSkills, skill)
    if (!fs.existsSync(src)) continue
    const dest = path.join(globalSwarm, skill)
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })
    synced++
    // Duplicate top-level copy breaks /slash load (skill name collision).
    const dup = path.join(globalRoot, skill)
    if (fs.existsSync(dup) && fs.statSync(dup).isDirectory()) {
      fs.rmSync(dup, { recursive: true, force: true })
    }
  }
  return synced
}

const results = []
for (const w of swarm.workers) {
  const profileDir = path.join(PROFILES, w.id)
  if (!fs.existsSync(profileDir)) {
    results.push(`${w.id}: profile dir missing, skipped`)
    continue
  }

  const configPath = path.join(profileDir, 'config.yaml')
  if (fs.existsSync(configPath)) {
    const cfg = yaml.parse(fs.readFileSync(configPath, 'utf8')) ?? {}
    const model = parseModel(w.model)
    if (model) {
      cfg.model = { ...(cfg.model || {}), provider: model.provider, default: model.default }
    }
    if (w.tools?.length) {
      const preserve =
        w.id === 'learning' ? ['hermes-cli', ...(cfg.toolsets ?? [])] : cfg.toolsets
      cfg.toolsets =
        w.id === 'learning'
          ? mergeToolsets(preserve, w.tools)
          : [...w.tools]
    }
    if (w.id === 'orchestrator' && cfg.kanban) {
      cfg.kanban.orchestrator_profile = 'orchestrator'
    }
    fs.writeFileSync(configPath, yaml.stringify(cfg))
    results.push(`${w.id}: config.yaml updated`)
  }

  const soulPath = path.join(profileDir, 'SOUL.md')
  const soulContent = w.id === 'learning' ? mergeLearningSoul(w, profileDir) : renderSoul(w)
  fs.writeFileSync(soulPath, soulContent)

  const memDir = path.join(profileDir, 'memory')
  fs.mkdirSync(memDir, { recursive: true })
  fs.writeFileSync(path.join(memDir, 'IDENTITY.md'), renderIdentity(w))
  syncSwarmSkills(w, profileDir)
  const staleSwarmNest = path.join(profileDir, 'skills', 'swarm')
  if (fs.existsSync(staleSwarmNest)) {
    fs.rmSync(staleSwarmNest, { recursive: true, force: true })
    results.push(`${w.id}: removed skills/swarm/ nest (fixes /slash name collision)`)
  }
  if (w.id === 'orchestrator') {
    const staleDispatch = path.join(profileDir, 'skills', 'workspace-dispatch')
    if (fs.existsSync(staleDispatch)) {
      fs.rmSync(staleDispatch, { recursive: true, force: true })
      results.push(`${w.id}: removed workspace-dispatch from profile (not for CLI orchestrator)`)
    }
  }
  results.push(
    w.id === 'learning'
      ? `${w.id}: SOUL.md merged (base + swarm extension), IDENTITY.md, swarm skills synced`
      : `${w.id}: SOUL.md, IDENTITY.md, swarm skills synced`,
  )
}

const globalSynced = syncGlobalSwarmSkills(swarm.workers)
results.push(`global: ${globalSynced} swarm skills → ~/.hermes/skills/swarm/ (for /slash commands)`)

console.log(results.join('\n'))
