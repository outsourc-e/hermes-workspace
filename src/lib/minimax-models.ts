export const MINIMAX_TEXT_MODELS = ['MiniMax-M3.1-Flash', 'MiniMax-M3']

type CatalogModel = {
  id?: string
  name?: string
  provider?: string
  [key: string]: unknown
}

/** Refresh ordinary catalogs only; saved/custom models bypass this function. */
export function currentMiniMaxModels<T extends CatalogModel>(
  models: Array<T>,
): Array<T | CatalogModel> {
  const result: Array<T | CatalogModel> = []
  const directRoutes = new Set<string>()
  const gatewayRoutes = new Set<string>()
  for (const model of models) {
    const id = model.id ?? ''
    const provider = model.provider?.toLowerCase() ?? ''
    const direct = id.match(/^(?:(minimax(?:-cn)?)\/)?(MiniMax-M\d[^/:]*)$/)
    if (direct && ['', 'unknown', 'minimax', 'minimax-cn'].includes(provider)) {
      const prefix = direct[1] ? `${direct[1]}/` : ''
      const route = `${provider}:${prefix}`
      if (!directRoutes.has(route)) {
        directRoutes.add(route)
        for (const current of MINIMAX_TEXT_MODELS) {
          const currentId = `${prefix}${current}`
          result.push(
            models.find(
              (entry) =>
                entry.id === currentId && entry.provider === model.provider,
            ) ?? {
              id: currentId,
              name: current,
              provider: model.provider,
            },
          )
        }
      }
      continue
    }
    // Gateway identifiers and metadata are owned by the gateway. Only retain
    // verified current routes already present; never synthesize a gateway ID.
    const gateway = id.match(/^(?:openrouter\/)?minimax\/(minimax-m[^/]+)$/i)
    if (
      gateway &&
      (provider === 'openrouter' || id.startsWith('openrouter/'))
    ) {
      const prefix = id.slice(0, id.length - gateway[1].length)
      const route = `${provider}:${prefix}`
      if (!gatewayRoutes.has(route)) {
        gatewayRoutes.add(route)
        for (const current of ['minimax-m3.1-flash:free', 'minimax-m3']) {
          const entry = models.find(
            (candidate) =>
              candidate.id === `${prefix}${current}` &&
              candidate.provider === model.provider,
          )
          if (entry) result.push(entry)
        }
      }
      continue
    }
    result.push(model)
  }
  return result
}
