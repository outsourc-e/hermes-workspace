export type AgentTaskState = 'idle' | 'walking' | 'working' | 'thinking' | 'needs-approval' | 'blocked' | 'done'

export type OlympusPoint = {
  x: number
  y: number
}

export type OlympusSize = {
  w: number
  h: number
}

export type OlympusBox = OlympusPoint & OlympusSize

export type StationKind = 'approval' | 'prompt' | 'model' | 'sorting' | 'listing' | 'skills' | 'command' | 'archive' | 'supplier' | string

export type DialogLayoutId = string

export type DialogLayout = {
  id: DialogLayoutId
  frameAsset: string
  /** Designed close socket. If the frame has a circular close preset, the X button must be centered here. */
  closeSpot: OlympusBox & { radius?: number }
  titleBox: OlympusBox
  subtitleBox: OlympusBox
  propBox: OlympusBox
  bodyBox: OlympusBox
  rowsBox: OlympusBox
  safetyBox: OlympusBox
}

export type OlympusStation = {
  id: string
  name: string
  kind: StationKind
  asset: string
  /** Percent position in room scene; bottom-center anchor by default. */
  position: OlympusPoint
  /** Percent size relative to room scene. */
  size: OlympusSize
  /** Click target; must align to the visible prop, not to the label. */
  hotspot: OlympusBox
  /** Where the mini god stands while operating this station. */
  operatorSpot: OlympusPoint
  /** Optional label plaque position. Labels are secondary; prop asset must be understandable without text. */
  labelSpot?: OlympusPoint
  dialogLayout: DialogLayoutId
  description: string
  statusLines: Array<string>
  allowedActions: Array<string>
  forbiddenActions: Array<string>
}

export type OlympusAgentInstance = {
  id: string
  name: string
  role: string
  roomId: string
  spriteSheet: string
  idleFrame?: string
  position: OlympusPoint
  target?: OlympusPoint
  state: AgentTaskState
  speech?: string
  activeStationId?: string
  patrolPoints?: Array<OlympusPoint>
}

export type OlympusRoom = {
  id: string
  name: string
  backgroundAsset: string
  bounds: OlympusSize
  tileGrid?: { cols: number; rows: number }
  entryPoints: Record<string, OlympusPoint>
  stations: Array<OlympusStation>
  agents: Array<OlympusAgentInstance>
  navigation?: {
    lanes?: Record<string, Array<OlympusPoint>>
  }
}

export type OlympusGameManifest = {
  version: string
  rooms: Array<OlympusRoom>
  dialogLayouts: Record<DialogLayoutId, DialogLayout>
}
