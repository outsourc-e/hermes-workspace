export type ResearchTargetType = 'product' | 'shop' | 'market'
export type ResearchDepth = 'quick' | 'standard' | 'deep' | 'meta'

export type ResearchModuleId =
  | 'official-shop'
  | 'catalog'
  | 'demand'
  | 'reviews'
  | 'competitors'
  | 'supplier-visual'
  | 'pricing'
  | 'seo'
  | 'risk'
  | 'meta-analysis'

export type ResearchDepthPreset = {
  id: ResearchDepth
  label: string
  shortLabel: string
  description: string
  expectedOutput: string
  modules: Array<ResearchModuleId>
}

export const RESEARCH_DEPTH_PRESETS: Array<ResearchDepthPreset> = [
  {
    id: 'quick',
    label: 'Quick Scan',
    shortLabel: 'Quick',
    description: 'תמונה מהירה: עובדות רשמיות, מוצרים מובילים וסיכונים בולטים.',
    expectedOutput: 'כרטיס מחקר קצר עם מקורות ופעולה הבאה.',
    modules: ['official-shop', 'catalog', 'demand', 'risk'],
  },
  {
    id: 'standard',
    label: 'Standard Research',
    shortLabel: 'Standard',
    description: 'מחקר עבודה מלא: ביקוש, קטלוג, ביקורות, מחיר, SEO ומתחרים.',
    expectedOutput: 'דוח עבודה עם טבלאות, מסקנות וקישורי הוכחה.',
    modules: ['official-shop', 'catalog', 'demand', 'reviews', 'competitors', 'pricing', 'seo', 'risk'],
  },
  {
    id: 'deep',
    label: 'Deep Investigation',
    shortLabel: 'Deep',
    description: 'חקירה עמוקה עם כל הקטלוג, בדיקת ספקים חזותית ושערי אמת.',
    expectedOutput: 'Workbook, גלריית ראיות, QA ודוח אינטראקטיבי.',
    modules: ['official-shop', 'catalog', 'demand', 'reviews', 'competitors', 'supplier-visual', 'pricing', 'seo', 'risk'],
  },
  {
    id: 'meta',
    label: 'Meta Analysis',
    shortLabel: 'Meta',
    description: 'השוואה רוחבית של כמה חנויות או שווקים, כמו Research Atlas הקיים.',
    expectedOutput: 'אתר השוואה מאוחד, workbooks נפרדים ומסקנות רוחב.',
    modules: ['official-shop', 'catalog', 'demand', 'reviews', 'competitors', 'supplier-visual', 'pricing', 'seo', 'risk', 'meta-analysis'],
  },
]

export type ResearchAtlasDownload = {
  id: string
  label: string
  fileName: string
  url: string
  sizeBytes: number
}

export type ResearchAtlasShop = {
  key: string
  name: string
  kind: string
  url: string
  date: string
  listings: number
  officialSales: number
  reviewsCount: number
  rating: number
  medianPrice: number
  headline: string
  topShare: number | null
  summary: Array<string>
  risks: Array<string>
  productCount: number
  supplierChecks: number
  strongSupplierMatches: number
  workbookUrl: string | null
}

export type ResearchAtlasSnapshot = {
  ok: true
  schemaVersion: 'war-room-research-atlas-v1'
  generatedAtMs: number
  source: 'verified-local-research-hub'
  freshness: {
    state: 'ready' | 'missing'
    label: string
    sourceCollectedAt: string
  }
  meta: {
    shops: number
    listings: number
    sales: number
    reviews: number
    generated: string
  }
  shops: Array<ResearchAtlasShop>
  downloads: Array<ResearchAtlasDownload>
  siteUrl: string
  qa: {
    status: 'passed'
    summary: string
    reportUrl: string
    truthBoundary: string
  }
  safety: {
    localOnly: true
    readOnlySources: true
    noEtsyWrites: true
    noSupplierMessages: true
    liveResearchStarted: false
  }
}

export type ResearchMissionInput = {
  targetType: ResearchTargetType
  target: string
  depth: ResearchDepth
  modules: Array<ResearchModuleId>
  notes?: string
}

export type ResearchMissionPacket = {
  schemaVersion: 'war-room-research-mission-v1'
  missionId: string
  createdAtMs: number
  status: 'staged'
  targetType: ResearchTargetType
  target: string
  depth: ResearchDepth
  modules: Array<ResearchModuleId>
  notes: string
  owner: {
    agentId: 'loki'
    roomId: 'etsy-market-lab'
    stationId: 'etsy-loki-product-hunt'
  }
  outputs: Array<string>
  steps: Array<{
    id: string
    label: string
    state: 'pending'
  }>
  safety: {
    localOnly: true
    externalResearchStarted: false
    noMarketplaceWrites: true
    noSupplierMessages: true
    approvalRequiredForSideEffects: true
  }
}

export type ResearchMissionResponse = {
  ok: true
  packet: ResearchMissionPacket
  savedPath: string
  readback: string
}

export function researchDepthPreset(depth: ResearchDepth) {
  return RESEARCH_DEPTH_PRESETS.find((preset) => preset.id === depth) ?? RESEARCH_DEPTH_PRESETS[1]
}
