/**
 * Player avatar customization config.
 *
 * Stored in localStorage under `hermes-playground-avatar-config`.
 * Drives PlayerAndCamera rendering + multiplayer presence color.
 */

export type AvatarConfig = {
  skin: string
  hair: string
  hairStyle: 'short' | 'cap' | 'long' | 'mohawk' | 'bald'
  eyes: string
  outfit: string
  outfitAccent: string
  cape: string
  helmet: 'winged' | 'circlet' | 'cap' | 'crown' | 'none'
  weapon: 'sword' | 'staff' | 'bow' | 'none'
  portrait: string // avatar PNG basename, e.g. 'hermes' | 'athena'
}

export const AVATAR_PRESETS: Record<string, AvatarConfig> = {
  hermes: {
    skin: '#fcd34d',
    hair: '#3f2511',
    hairStyle: 'short',
    eyes: '#0b1220',
    outfit: '#2dd4bf',
    outfitAccent: '#facc15',
    cape: '#0891b2',
    helmet: 'winged',
    weapon: 'sword',
    portrait: 'hermes',
  },
  athena: {
    skin: '#fde7c3',
    hair: '#0e7490',
    hairStyle: 'long',
    eyes: '#1e293b',
    outfit: '#a78bfa',
    outfitAccent: '#fbbf24',
    cape: '#7c3aed',
    helmet: 'crown',
    weapon: 'staff',
    portrait: 'athena',
  },
  apollo: {
    skin: '#fcd9a4',
    hair: '#fcd34d',
    hairStyle: 'long',
    eyes: '#1f2937',
    outfit: '#f59e0b',
    outfitAccent: '#fde68a',
    cape: '#b45309',
    helmet: 'circlet',
    weapon: 'bow',
    portrait: 'apollo',
  },
  iris: {
    skin: '#fde7c3',
    hair: '#22d3ee',
    hairStyle: 'short',
    eyes: '#0b1220',
    outfit: '#22d3ee',
    outfitAccent: '#fbbf24',
    cape: '#0e7490',
    helmet: 'cap',
    weapon: 'none',
    portrait: 'iris',
  },
  nike: {
    skin: '#fcd9a4',
    hair: '#1f2937',
    hairStyle: 'mohawk',
    eyes: '#0b1220',
    outfit: '#fb7185',
    outfitAccent: '#fbbf24',
    cape: '#7c2d12',
    helmet: 'crown',
    weapon: 'sword',
    portrait: 'nike',
  },
  pan: {
    skin: '#e7c089',
    hair: '#34d399',
    hairStyle: 'mohawk',
    eyes: '#0b1220',
    outfit: '#34d399',
    outfitAccent: '#fbbf24',
    cape: '#065f46',
    helmet: 'cap',
    weapon: 'staff',
    portrait: 'pan',
  },
}

export const SKIN_TONES = ['#f5e1c8', '#fde7c3', '#fcd9a4', '#e7c089', '#c89a6b', '#a07248', '#7c4f2c', '#4a2f1a']
export const HAIR_COLORS = ['#0b1220', '#3f2511', '#7c4a1f', '#a16207', '#fcd34d', '#fef3c7', '#94a3b8', '#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fb7185']
export const EYE_COLORS = ['#0b1220', '#1e3a8a', '#0e7490', '#15803d', '#7c2d12', '#a78bfa']
export const OUTFIT_COLORS = ['#2dd4bf', '#22d3ee', '#a78bfa', '#fb7185', '#facc15', '#34d399', '#f472b6', '#38bdf8', '#fbbf24', '#fde68a', '#1f2937', '#7c2d12']
export const ACCENT_COLORS = ['#facc15', '#fbbf24', '#fde68a', '#22d3ee', '#a78bfa', '#fff', '#fb7185']
export const PORTRAITS = ['hermes', 'athena', 'apollo', 'iris', 'nike', 'pan', 'chronos', 'eros', 'artemis']

const KEY = 'hermes-playground-avatar-config'

export function loadAvatarConfig(): AvatarConfig {
  if (typeof window === 'undefined') return AVATAR_PRESETS.hermes
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return AVATAR_PRESETS.hermes
    const parsed = JSON.parse(raw)
    return { ...AVATAR_PRESETS.hermes, ...parsed }
  } catch {
    return AVATAR_PRESETS.hermes
  }
}

export function saveAvatarConfig(cfg: AvatarConfig) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cfg))
    window.dispatchEvent(new CustomEvent('hermes-playground-avatar-changed'))
  } catch {}
}
