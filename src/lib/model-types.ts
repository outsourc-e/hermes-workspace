// Model types (Model catalog types)
export type ModelCatalogEntry =
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

export type ModelSwitchResponse = {
  ok?: boolean
  error?: string
  resolved?: {
    modelProvider?: string
    model?: string
  }
}
