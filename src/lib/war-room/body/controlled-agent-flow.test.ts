import { describe, expect, it } from 'vitest'
import { liveAgentActionIntentFor, parseControlledAgentId, requestedTerraSearchLimit } from './controlled-agent-flow'

describe('controlled agent flow parsing', () => {
  it('accepts Smart Intake controlled worker id', () => {
    expect(parseControlledAgentId('smart-intake')).toBe('smart-intake')
  })

  it('rejects unknown controlled worker ids with the allowed list', () => {
    expect(() => parseControlledAgentId('julius')).toThrow(/smart-intake/)
  })
})

describe('Action System V1 intent routing', () => {
  it('routes a Hermes request that names Terra and model search into Terra Model Hunt', () => {
    expect(liveAgentActionIntentFor('hermes', 'שלח את טרה לחפש 20 פידגטים להדפסה ותציג לי כרטיסים')).toBe('terra_model_search')
    expect(requestedTerraSearchLimit('שלח את טרה לחפש 20 פידגטים להדפסה')).toBe(20)
  })

  it('keeps ordinary Hermes chat as chat only', () => {
    expect(liveAgentActionIntentFor('hermes', 'מה המצב של החדר?')).toBe('chat')
  })

  it('marks explicit actions without a connected host tool as missing capability', () => {
    expect(liveAgentActionIntentFor('loki', 'שלח 10 הודעות לספקים עכשיו')).toBe('unsupported_action')
  })

  it('caps large requested Terra search limits to the safe UI maximum', () => {
    expect(requestedTerraSearchLimit('חפש 99 מודלים')).toBe(24)
  })
})
