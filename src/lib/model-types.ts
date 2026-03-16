// Model types (extracted from gateway-api.ts)
export type GatewayModelCatalogEntry =
  | string
  | {
      alias?: string
      provider?: string
      model?: string
      name?: string
      label?: string
      displayName?: string
      id?: string
      [key: string]: unknown
    }

export type GatewayModelSwitchResponse = {
  ok?: boolean
  error?: string
  resolved?: {
    modelProvider?: string
    model?: string
  }
}
