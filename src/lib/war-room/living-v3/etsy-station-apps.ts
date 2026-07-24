import type { LivingV3AgentId, LivingV3StationId } from './living-v3-contract'

export type EtsyMarketLabStationId =
  | 'etsy-loki-product-hunt'
  | 'etsy-thor-seo-metrics'
  | 'etsy-loki-source-leads'
  | 'etsy-thor-source-truth'
  | 'etsy-thor-shotlab-prep'
  | 'etsy-thor-qa-review'
  | 'etsy-odin-draft-approval'

export type EtsyMarketLabStationAppId =
  | 'loki-product-hunter'
  | 'thor-seo-metrics'
  | 'loki-source-leads'
  | 'thor-source-truth'
  | 'thor-shotlab-forge'
  | 'thor-qa-review'
  | 'odin-draft-approval'

export const ETSY_MARKET_LAB_STATION_APP_IDS: Record<EtsyMarketLabStationId, EtsyMarketLabStationAppId> = {
  'etsy-loki-product-hunt': 'loki-product-hunter',
  'etsy-thor-seo-metrics': 'thor-seo-metrics',
  'etsy-loki-source-leads': 'loki-source-leads',
  'etsy-thor-source-truth': 'thor-source-truth',
  'etsy-thor-shotlab-prep': 'thor-shotlab-forge',
  'etsy-thor-qa-review': 'thor-qa-review',
  'etsy-odin-draft-approval': 'odin-draft-approval',
}

export const ETSY_MARKET_LAB_STATION_IDS = Object.keys(ETSY_MARKET_LAB_STATION_APP_IDS) as Array<EtsyMarketLabStationId>

export type EtsyMarketLabResidentAgentId = Extract<LivingV3AgentId, 'loki' | 'thor' | 'odin'>

export const ETSY_MARKET_LAB_RESIDENT_AGENT_IDS: Array<EtsyMarketLabResidentAgentId> = [
  'loki',
  'thor',
  'odin',
]

export const ETSY_MARKET_LAB_STATION_OPERATOR_IDS: Record<EtsyMarketLabStationId, EtsyMarketLabResidentAgentId> = {
  'etsy-loki-product-hunt': 'loki',
  'etsy-thor-seo-metrics': 'thor',
  'etsy-loki-source-leads': 'loki',
  'etsy-thor-source-truth': 'thor',
  'etsy-thor-shotlab-prep': 'thor',
  'etsy-thor-qa-review': 'thor',
  'etsy-odin-draft-approval': 'odin',
}

export function etsyMarketLabStationAppId(stationId: EtsyMarketLabStationId): EtsyMarketLabStationAppId
export function etsyMarketLabStationAppId(stationId: LivingV3StationId): EtsyMarketLabStationAppId | null
export function etsyMarketLabStationAppId(stationId: LivingV3StationId): EtsyMarketLabStationAppId | null {
  if (!isEtsyMarketLabStationId(stationId)) return null
  return ETSY_MARKET_LAB_STATION_APP_IDS[stationId]
}

export function etsyMarketLabStationOperatorId(stationId: EtsyMarketLabStationId): EtsyMarketLabResidentAgentId
export function etsyMarketLabStationOperatorId(stationId: LivingV3StationId): EtsyMarketLabResidentAgentId | null
export function etsyMarketLabStationOperatorId(stationId: LivingV3StationId): EtsyMarketLabResidentAgentId | null {
  if (!isEtsyMarketLabStationId(stationId)) return null
  return ETSY_MARKET_LAB_STATION_OPERATOR_IDS[stationId]
}

export function isEtsyMarketLabStationId(stationId: LivingV3StationId): stationId is EtsyMarketLabStationId {
  return stationId in ETSY_MARKET_LAB_STATION_APP_IDS
}
