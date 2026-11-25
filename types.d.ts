/**
 * DSH wire protocol types (v0.1.2-rc.1, Typert Gateway) — shared between
 * mobile/app.js (unary RPC + remote.mux logical streams), client/client.js
 * (bundle registration protocol) and lib/index.js (cordis host surface).
 * Pure declarations: nothing here emits code.
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
  cwd?: string
  running?: boolean
  blank?: boolean
  updatedAt?: number
  origin?: string
  parentSessionId?: string | null
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
  hidden?: boolean
  [key: string]: unknown
}

/** directoryPicker/list — one level of directories under `path`. */
export interface DirectoryListResult {
  path: string
  home?: string
  crumbs: DirectoryEntry[]
  entries: DirectoryEntry[]
  truncated?: boolean
  [key: string]: unknown
}

export interface FileUploadResult {
  receiptId?: string
  file?: unknown
  [key: string]: unknown
}

/** workspaceFiles/list — files under the session-scoped workspace path. */
export interface WorkspaceFileEntry {
  name: string
  type: string
  size?: number
  [key: string]: unknown
}

export interface WorkspaceFilesListResult {
  path: string
  entries: WorkspaceFileEntry[]
  truncated?: boolean
  [key: string]: unknown
}

export type EndpointMapper = (p: any) => any

export type EndpointEntry = [string, EndpointMapper]

export interface ChatState {
  id: string
  title?: string
  events: JournalRecord[]
  cursor?: unknown
  hasMore?: boolean
  projections: { values?: Record<string, unknown>; [key: string]: any } | null
  baseSeq?: number | null
  running?: boolean
  steps: Record<string, StepState>
  cards: Record<string, ToolCardState>
  [key: string]: any
}

export interface StepState {
  node?: any
  body?: any
  texts: Record<string, string>
  reasoning: Record<string, string>
  reasonEl?: any
  [key: string]: any
}

export interface ToolCardState {
  [key: string]: any
}

// ── client bundle registration protocol (client/) ─────────────
//
// Shapes mirror @deepseek-ai/dsh-client-modules' manifest.d.ts; the plugin
// cannot import that package directly, so the subset it relies on is declared
// here and checked by tsc.

/** Module-table require passed to a client bundle factory. */
export interface ClientBundleRequire {
  (specifier: string): unknown
  /** Load and resolve a package-local dynamic chunk asynchronously. */
  async(specifier: string): Promise<unknown>
  /** Resolve a package-asset reference to the URL the page loads. */
  asset(reference: string): string
}

/** One bundle registration submitted through window.__ModuleLoader__.load. */
export interface ClientBundleRegistration {
  /** Plugin id (package name); must match the boot graph row being executed. */
  id: string
  /** Package-local chunk filename; absent for the package's client.js entry. */
  chunk?: string
  factory: (require: ClientBundleRequire) => Record<string, unknown>
}

/** Page-global facade installed by the DSH HTML bootstrap before plugin bundles run. */
export interface ClientModuleLoaderTarget {
  mode: 'queue' | 'live'
  pendingQueue: ClientBundleRegistration[]
  load(registration: ClientBundleRegistration): void
  create(options: unknown): unknown
}

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
    /** Registration facade; non-optional here because a bundle only runs after it is installed. */
    __ModuleLoader__: ClientModuleLoaderTarget
  }
}

export interface IncomingMessage {
  headers: Record<string, string | string[] | undefined>
  method?: string
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
