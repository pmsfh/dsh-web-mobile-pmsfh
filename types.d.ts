/**
 * DSH wire protocol types (v0.1.2-rc.1, Typert Gateway) — shared between
 * mobile/app.js (unary RPC + remote.mux logical streams) and lib/index.js
 * (cordis host surface). Pure declarations: nothing here emits code.
 *
 * Source of truth = the wire shapes consumed in mobile/app.js; loosened with
 * optional fields where the page only reads a subset (e.g. SessionSummary).
 */

// ── unary RPC envelope ─────────────────────────────────────────

export interface RpcRequestEnvelope {
  type: 'client-request'
  rpcId: string
  method: string
  payload: { args: Record<string, unknown> }
}

export interface RpcError {
  message: string
  code?: string
}

export interface RpcResponseEnvelope {
  type: 'server-response'
  rpcId: string
  result: {
    ok: boolean
    value?: unknown
    error?: RpcError
  }
}

// ── session/list ───────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string
  projections?: { values?: Record<string, unknown> }
  [key: string]: unknown
}

export interface SessionListResult {
  items: SessionSummary[]
}

// ── session/follow stream frames ───────────────────────────────

export interface JournalEvent {
  type?: string
  seq?: number
  time?: number
  data?: unknown
  [key: string]: unknown
}

/** One journal row: history pages and snapshot records are both record-wrapped. */
export interface JournalRecord {
  event: JournalEvent
  [key: string]: unknown
}

export interface FollowHeader {
  running?: boolean
  status?: string
  [key: string]: unknown
}

export interface SessionSnapshotFrame {
  type: 'snapshot'
  header?: FollowHeader
  cursor?: unknown
  records: JournalRecord[]
  hasMore?: boolean
  projections?: { values?: Record<string, unknown> }
}

export interface SessionEventFrame {
  type: 'event'
  event: JournalEvent
}

export type SessionFollowFrame = SessionSnapshotFrame | SessionEventFrame

// ── workspace/follow stream frames ─────────────────────────────

export interface Workspace {
  workspaceId: string
  path?: string
  title?: string
  sessionIds?: string[]
  [key: string]: unknown
}

export interface WorkspaceBaselineValue {
  items: Workspace[]
  archivedSessionIds?: string[]
}

export interface WorkspaceBaselineFrame {
  type: 'baseline'
  value: WorkspaceBaselineValue
}

export interface WorkspaceUpsertFrame {
  type: 'upsert'
  workspace: Workspace
}

export interface WorkspaceRemoveFrame {
  type: 'remove'
  workspaceId: string
}

export interface WorkspaceOrderFrame {
  type: 'order'
  workspaceIds: string[]
}

export interface WorkspaceArchivedFrame {
  type: 'archived'
  archivedSessionIds: string[]
}

export type WorkspaceFollowFrame =
  | WorkspaceBaselineFrame
  | WorkspaceUpsertFrame
  | WorkspaceRemoveFrame
  | WorkspaceOrderFrame
  | WorkspaceArchivedFrame

// ── remote.mux socket frames ───────────────────────────────────

export interface MuxOpenFrame {
  type: 'open'
  streamId: string
  endpoint: string
  payload: { args: Record<string, unknown> }
}

export interface MuxCancelFrame {
  type: 'cancel'
  streamId: string
}

/** Inbound item frames carry streamId + a frame body whose shape depends on the endpoint. */
export interface MuxItemFrame {
  type: string
  streamId: string
  value?: unknown
  [key: string]: unknown
}

// ── $events bus (waterfall) ────────────────────────────────────

export interface EventsReadyFrame {
  type: 'ready'
  clientId: string
  host?: unknown
}

export interface EventsEmitFrame {
  type: 'emit'
  event: string
  args: unknown
}

export interface EventsWaterfallFrame {
  type: 'waterfall'
  event: string
  eventId: string
  agentId: string
  request: unknown
}

export type EventsFrame = EventsReadyFrame | EventsEmitFrame | EventsWaterfallFrame

/** POST /api/$events/result payload — answers a waterfall request. */
export interface EventsResultArgs {
  clientId: string
  eventId: string
  outcome: { kind: 'result'; value: unknown }
}

// ── misc RPC payloads used by the page ─────────────────────────

export interface DirectoryEntry {
  name: string
  path: string
  kind?: string
  [key: string]: unknown
}

export interface DirectoryListResult {
  path: string
  items?: DirectoryEntry[]
  [key: string]: unknown
}

export interface FileUploadResult {
  receiptId?: string
  [key: string]: unknown
}

export interface WorkspaceFileEntry {
  name: string
  path?: string
  kind?: string
  size?: number
  [key: string]: unknown
}

export interface WorkspaceFilesListResult {
  items?: WorkspaceFileEntry[]
  [key: string]: unknown
}

export type EndpointMapper = (p: any) => any

export type EndpointEntry = [string, EndpointMapper]

// ── cordis host surface (lib/) ─────────────────────────────────

declare global {
  interface Window {
    /** Vendored markdown-it UMD global (mobile/vendor/markdown-it.min.js). */
    markdownit?: any
    /** Vendored CJK-friendly plugin UMD global. */
    markdownitCjkFriendly?: any
    /** Debug hooks: captured mux frames (probe/tests). */
    __frames?: any
    /** Debug handle: live API for e2e probes. */
    __dshwm?: any
  }
}

export interface IncomingMessage {
  headers: Record<string, string | string[] | undefined>
  [key: string]: unknown
}

export interface ServerResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): void
  end(body?: string | Uint8Array): void
  [key: string]: unknown
}

export interface RouteSpec {
  kind: string
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** ctx.webServer — exact-route registration used by lib/index.js. */
export interface WebServerService {
  register(spec: RouteSpec): () => void
}

export interface Admission {
  rejection?: number
}

/** ctx.connection — the host's own browser-session admission check. */
export interface ConnectionService {
  admit(req: IncomingMessage): Admission | null | undefined
}

export interface CordisContext {
  get(name: 'webServer'): WebServerService | undefined
  get(name: 'connection'): ConnectionService | undefined
  get(name: string): unknown
  connection?: ConnectionService
  webServer?: WebServerService
  effect(fn: () => void | (() => void), label?: string): void
}
