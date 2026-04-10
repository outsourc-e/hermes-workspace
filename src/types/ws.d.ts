declare module 'ws' {
  import { EventEmitter } from 'node:events'
  import type { Server as HttpServer } from 'node:http'

  export type RawData =
    | string
    | Buffer
    | Array<Buffer>
    | ArrayBuffer
    | Array<Buffer>

  type ErrorCallback = (err?: Error) => void

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: number
    static readonly OPEN: number
    static readonly CLOSING: number
    static readonly CLOSED: number

    readonly CONNECTING: number
    readonly OPEN: number
    readonly CLOSING: number
    readonly CLOSED: number

    readyState: number

    constructor(url: string, options?: Record<string, unknown>)

    send(data: string | Buffer, cb?: ErrorCallback): void
    close(code?: number, reason?: string): void
    terminate(): void
    ping(): void
  }

  export interface WebSocketServerOptions {
    server?: HttpServer
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServerOptions)
  }

  export default WebSocket
}
