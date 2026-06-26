// VoiceMod — fleet carry-on module (per-agent voice identity under the SOUL).
// New files only; the sole upstream graft is a one-line <VoiceModPanel/> render
// in profiles-screen.tsx, committed separately as `carry:` for clean daily merges.
export { VoiceModPanel } from './voicemod-panel'
export { useVoiceMod } from './use-voicemod'
export type {
  AvailableVoices,
  EnrollResult,
  ProfileVoiceState,
  VoiceEngine,
} from './use-voicemod'
