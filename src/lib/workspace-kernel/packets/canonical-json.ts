const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

function rotateRight(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount))
}

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80

  const bitLength = bytes.length * 8
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const state: Array<number> = [...SHA256_INITIAL_STATE]
  const words = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + (index * 4), false)
    }
    for (let index = 16; index < 64; index += 1) {
      const prior15 = words[index - 15] ?? 0
      const prior2 = words[index - 2] ?? 0
      const sigma0 = rotateRight(prior15, 7) ^ rotateRight(prior15, 18) ^ (prior15 >>> 3)
      const sigma1 = rotateRight(prior2, 17) ^ rotateRight(prior2, 19) ^ (prior2 >>> 10)
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = state
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  return state.map((value) => value.toString(16).padStart(8, '0')).join('')
}

const TOP_LEVEL_DERIVED_FIELDS = new Set([
  'contentHash',
  'status',
  'readback',
  'lifecycle',
  'lifecycleEvents',
  'acks',
  'handoffAck',
])

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function canonicalize(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Workspace Packet canonical JSON requires finite numbers.')
    return JSON.stringify(value)
  }
  if (typeof value === 'undefined') throw new TypeError('Workspace Packet canonical JSON does not allow undefined.')
  if (typeof value === 'bigint') throw new TypeError('Workspace Packet canonical JSON does not allow bigint.')
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Workspace Packet canonical JSON does not allow ${typeof value}.`)
  }
  if (typeof value !== 'object') throw new TypeError('Unsupported Workspace Packet canonical JSON value.')
  if (ancestors.has(value)) throw new TypeError('Workspace Packet canonical JSON does not allow cyclic references.')

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`
    }
    if (!isPlainObject(value)) {
      throw new TypeError('Workspace Packet canonical JSON accepts only plain objects and arrays.')
    }

    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      throw new TypeError('Workspace Packet canonical JSON does not allow symbol keys.')
    }
    const keys = (ownKeys as Array<string>).sort()
    const entries = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable) {
        throw new TypeError('Workspace Packet canonical JSON does not allow non-enumerable fields.')
      }
      return `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`
    })
    return `{${entries.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalizeWorkspacePacketContent(value: unknown): string {
  return canonicalize(value, new WeakSet())
}

function withoutTopLevelDerivedFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !TOP_LEVEL_DERIVED_FIELDS.has(key)),
  )
}

export function workspacePacketContentHash(packetWithoutHash: unknown): string {
  const canonical = canonicalizeWorkspacePacketContent(withoutTopLevelDerivedFields(packetWithoutHash))
  return sha256Hex(canonical)
}
