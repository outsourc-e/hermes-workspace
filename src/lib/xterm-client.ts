/** Client-only dynamic xterm loaders with CJS/ESM interop (Vite optimizeDeps-safe). */

import type { FitAddon } from 'xterm-addon-fit'
import type { WebLinksAddon } from 'xterm-addon-web-links'
import type { Terminal } from 'xterm'

type Ctor<T> = new (...args: ConstructorParameters<new () => T>) => T

function pickConstructor<T>(mod: Record<string, unknown>, exportName: string): Ctor<T> {
  const direct = mod[exportName]
  if (typeof direct === 'function') {
    return direct as Ctor<T>
  }
  const nested = mod.default
  if (nested && typeof nested === 'object') {
    const fromDefault = (nested as Record<string, unknown>)[exportName]
    if (typeof fromDefault === 'function') {
      return fromDefault as Ctor<T>
    }
  }
  throw new Error(`${exportName} is not a constructor (xterm module interop)`)
}

let loaded = false
let TerminalCtor: Ctor<Terminal>
let FitAddonCtor: Ctor<FitAddon>
let WebLinksAddonCtor: Ctor<WebLinksAddon>

export type XtermClientCtors = {
  Terminal: Ctor<Terminal>
  FitAddon: Ctor<FitAddon>
  WebLinksAddon: Ctor<WebLinksAddon>
}

export async function loadXtermClient(): Promise<XtermClientCtors> {
  if (loaded) {
    return { Terminal: TerminalCtor, FitAddon: FitAddonCtor, WebLinksAddon: WebLinksAddonCtor }
  }

  const [xtermMod, fitMod, linksMod] = await Promise.all([
    import('xterm'),
    import('xterm-addon-fit'),
    import('xterm-addon-web-links'),
  ])

  if (typeof window !== 'undefined') {
    await import('@/lib/xterm-styles.client')
  }

  TerminalCtor = pickConstructor<Terminal>(xtermMod as Record<string, unknown>, 'Terminal')
  FitAddonCtor = pickConstructor<FitAddon>(fitMod as Record<string, unknown>, 'FitAddon')
  WebLinksAddonCtor = pickConstructor<WebLinksAddon>(
    linksMod as Record<string, unknown>,
    'WebLinksAddon',
  )
  loaded = true

  return { Terminal: TerminalCtor, FitAddon: FitAddonCtor, WebLinksAddon: WebLinksAddonCtor }
}
