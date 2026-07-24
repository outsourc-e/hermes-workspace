import { describe, expect, it } from 'vitest'
import { liveAgentActionIntentFor, parseControlledAgentId, requestedTerraSearchLimit, runControlledLiveAgentChatFlow } from './controlled-agent-flow'

describe('controlled agent flow parsing', () => {
  it('accepts Smart Intake controlled worker id', () => {
    expect(parseControlledAgentId('smart-intake')).toBe('smart-intake')
  })

  it('rejects unknown controlled worker ids with the allowed list', () => {
    expect(() => parseControlledAgentId('julius')).toThrow(/smart-intake/)
  })
})

describe('Action System V1 intent routing', () => {
  it('offers Council consultation for a strategic Hermes request without starting Council', () => {
    expect(liveAgentActionIntentFor('hermes', 'מה כדאי לעשות באסטרטגיית ההשקה?')).toBe('council_consultation_offer')
    expect(liveAgentActionIntentFor('hermes', 'שאל את המועצה אם נכון להמשיך עכשיו')).toBe('council_consultation_offer')
  })

  it('routes a Hermes request that names Terra and model search into Terra Model Hunt', () => {
    expect(liveAgentActionIntentFor('hermes', 'שלח את טרה לחפש 20 פידגטים להדפסה ותציג לי כרטיסים')).toBe('terra_model_search')
    expect(requestedTerraSearchLimit('שלח את טרה לחפש 20 פידגטים להדפסה')).toBe(20)
  })

  it('keeps ordinary Hermes chat as chat only', () => {
    expect(liveAgentActionIntentFor('hermes', 'מה המצב של החדר?')).toBe('chat')
    expect(liveAgentActionIntentFor('terra', 'מה האסטרטגיה הנכונה?')).toBe('chat')
  })

  it('marks explicit actions without a connected host tool as missing capability', () => {
    expect(liveAgentActionIntentFor('loki', 'שלח 10 הודעות לספקים עכשיו')).toBe('unsupported_action')
  })

  it('caps large requested Terra search limits to the safe UI maximum', () => {
    expect(requestedTerraSearchLimit('חפש 99 מודלים')).toBe(24)
  })

  it('pauses strategic Hermes requests for DLV approval without spending a model call', async () => {
    const result = await runControlledLiveAgentChatFlow({
      agentId: 'hermes',
      operatorNote: 'מה כדאי לעשות באסטרטגיית ההשקה?',
    })

    expect(result.ok).toBe(true)
    expect(result.actionSystemRun.intent).toBe('council_consultation_offer')
    expect(result.actionSystemRun.status).toBe('waiting_operator')
    expect(result.result.usage.mode).toBe('dry_run')
    expect(result.result.usage.budget).toBe('local routing only; 0 model calls')
  })
})
