/**
 * dsh-web-mobile-pmsfh standalone mobile page — rc.1 wire.
 *
 * Wire protocol (DSH v0.1.2-rc.1, Typert Gateway):
 *   unary RPC : POST /api/<namespace>/<method>
 *               { type:'client-request', rpcId, method, payload:{args:{...named}} }
 *               → { type:'server-response', rpcId, result:{ok,value|error} }
 *   live push : WS /api/remote.mux — logical streams over one socket:
 *               open  → { type:'open', streamId, endpoint, payload:{args} }
 *               recv  ← { type:'item'|'error'|'end', streamId, value }
 *               cancel→ { type:'cancel', streamId }
 *               · endpoint '$events' (payload {args:{}}) = global bus:
 *                 {type:'ready',clientId,host} / {type:'emit',event,args} /
 *                 {type:'waterfall',event,eventId,agentId,request} / {type:'cancel',eventId}
 *               · endpoint 'session/follow' = per-session journal stream:
 *                 first item {type:'snapshot',header,cursor,records,hasMore,projections},
 *                 then {type:'event',event:{type,seq,time,data,...}}
 *   answers   : waterfall → POST /api/$events/result
 *               payload {args:{clientId,eventId,outcome:{kind:'result',value}}}
 *   history   : pages come back as records — {type:'event',event} or packed
 *               {type:'chunks',event:{type:'chunkrow/text-chunks'|...,data:{turn,step,index,dt,texts}}}
 *
 * UI phases unchanged: list (workspace-MEMBERSHIP groups, collapsible), chat
 * (markdown + live fold + tool cards + pagination), composer, approvals,
 * model sheet, upload/download via dsh-file routes.
 */
(function () {
  'use strict'

  // ── i18n ────────────────────────────────────────────────────
  var zh = (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0
  var T = zh ? {
    title: '会话',
    newSession: '新建会话',
    wsSection: '工作区',
    ungrouped: '未分组',
    permTitle: '权限',
    permRequired: '必选',
    permReadOnlyDesc: '只读，无法修改文件',
    permWorkspaceWriteDesc: '可写入工作区与允许的临时目录；越界操作需审批',
    permFullAccessDesc: '完全文件访问，无需审批确认',
    create: '创建会话',
    choosePermFirst: '请先选择权限',
    permFail: '权限设置失败，将使用默认权限',
    createFail: '创建失败',
    wsListFail: '工作区列表加载失败，可新建工作区或稍后重试',
    faTitle: '确认启用 Full access？',
    faDesc: '启用 Full access 后，新会话将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任后续任务时使用。',
    faAck: '我已了解风险，并愿意继续',
    faCancel: '取消',
    faEnable: '启用 Full access',
    untitled: '新会话',
    loading: '加载中…',
    empty: '还没有会话\n点右上角「＋」开始',
    chatEmpty: '发消息开始对话\n📎 可以传文件给智能体',
    loadFail: '加载失败，点右上角刷新重试',
    desktop: '桌面版',
    justNow: '刚刚',
    minutesAgo: ' 分钟前',
    hoursAgo: ' 小时前',
    daysAgo: ' 天前',
    running: '运行中',
    historyFail: '历史加载失败',
    loadOlder: '加载更早的消息',
    thinking: '思考过程',
    thinkingLive: '思考中…',
    stopped: '已停止',
    compacted: '— 上下文已压缩 —',
    placeholder: '给智能体发消息',
    send: '发送',
    stop: '停止',
    queued: ' 条排队中',
    attach: '附件',
    upload: '添加附件',
    download: '下载工作区文件',
    uploading: '上传中…',
    uploaded: '已添加 ',
    uploadFail: '上传失败',
    attachHint: '附件将随下一条消息发送',
    fileTooBig: '文件过大（上限 8 MB）',
    detach: '移除',
    logout: '退出登录',
    account: '账户',
    downloadFail: '下载失败',
    noFiles: '工作区没有可下载的文件',
    noCwd: '该会话没有工作区',
    modelLoading: '模型加载中…',
    modelFail: '模型列表不可用',
    approvalTitle: '需要审批',
    allow: '允许一次',
    deny: '拒绝',
    answerSend: '提交',
    answerLater: '稍后',
    customHint: '其他（自己输入）',
    sendFail: '发送失败',
    sessionActions: '会话操作',
    archive: '归档此会话',
    archived: '已归档',
    archiveFail: '归档失败',
    wsNew: '➕ 新建工作区…',
    wsNewHint: '选择一个目录作为新工作区',
    dirTitle: '选择工作区目录',
    dirUse: '使用此目录',
    dirNewFolder: '新建文件夹',
    dirCreate: '创建',
    dirBack: '返回',
    dirFail: '目录加载失败',
    dirEmpty: '（空目录）',
    dirTruncated: '条目过多，仅显示部分',
    wsCreateFail: '工作区创建失败',
    wsRename: '重命名工作区',
    wsRenamed: '已重命名',
    wsRenameFail: '重命名失败',
    wsDelete: '删除工作区',
    wsDeleteDesc: '将把“{name}”从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在“未分组”下。',
    wsDeleted: '工作区已删除',
    wsDeleteFail: '删除失败',
    wsEmpty: '无会话',
    effort: '推理等级',
    effortDefault: 'Default',
    save: '保存',
    cancel: '取消',
  } : {
    title: 'Sessions',
    newSession: 'New session',
    wsSection: 'Workspace',
    ungrouped: 'Ungrouped',
    permTitle: 'Permission',
    permRequired: 'required',
    permReadOnlyDesc: 'Read-only, cannot modify files',
    permWorkspaceWriteDesc: 'Write inside the workspace and permitted temporary directories; wider retries require approval',
    permFullAccessDesc: 'Full file access without approval prompts',
    create: 'Create session',
    choosePermFirst: 'Choose a permission first',
    permFail: 'Permission setup failed; session uses the default',
    createFail: 'Failed to create',
    wsListFail: 'Workspace list unavailable — create a workspace or retry',
    faTitle: 'Enable Full access?',
    faDesc: 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
    faAck: 'I understand the risks and want to continue',
    faCancel: 'Cancel',
    faEnable: 'Enable Full access',
    untitled: 'New session',
    loading: 'Loading…',
    empty: 'No sessions yet\nTap ＋ to start one',
    chatEmpty: 'Send a message to start\n📎 attaches a file for the agent',
    loadFail: 'Load failed — tap refresh to retry',
    desktop: 'Desktop version',
    justNow: 'just now',
    minutesAgo: 'm ago',
    hoursAgo: 'h ago',
    daysAgo: 'd ago',
    running: 'running',
    historyFail: 'Failed to load history',
    loadOlder: 'Load older messages',
    thinking: 'Thinking',
    thinkingLive: 'Thinking…',
    stopped: 'stopped',
    compacted: '— context compacted —',
    placeholder: 'Message the agent',
    send: 'Send',
    stop: 'Stop',
    queued: ' queued',
    attach: 'Attach',
    upload: 'Add attachment',
    download: 'Download workspace file',
    uploading: 'Uploading…',
    uploaded: 'Added ',
    uploadFail: 'Upload failed',
    attachHint: 'Attachments are sent with your next message',
    fileTooBig: 'File too large (8 MB limit)',
    detach: 'Remove',
    logout: 'Sign out',
    account: 'Account',
    downloadFail: 'Download failed',
    noFiles: 'No downloadable files in the workspace',
    noCwd: 'This session has no workspace',
    modelLoading: 'Loading models…',
    modelFail: 'Model list unavailable',
    approvalTitle: 'Approval required',
    allow: 'Allow once',
    deny: 'Deny',
    answerSend: 'Submit',
    answerLater: 'Later',
    customHint: 'Other (type your own)',
    sendFail: 'Send failed',
    sessionActions: 'Session actions',
    archive: 'Archive this session',
    archived: 'Archived',
    archiveFail: 'Archive failed',
    wsNew: '➕ New workspace…',
    wsNewHint: 'Pick a folder to register as a workspace',
    dirTitle: 'Pick workspace folder',
    dirUse: 'Use this folder',
    dirNewFolder: 'New folder',
    dirCreate: 'Create',
    dirBack: 'Back',
    dirFail: 'Failed to load folder',
    dirEmpty: '(empty folder)',
    dirTruncated: 'Too many entries — only part shown',
    wsCreateFail: 'Failed to create workspace',
    wsRename: 'Rename workspace',
    wsRenamed: 'Renamed',
    wsRenameFail: 'Rename failed',
    wsDelete: 'Delete workspace',
    wsDeleteDesc: 'This removes “{name}” from the workspace list. The folder and session logs will be kept. Its sessions will appear under Ungrouped.',
    wsDeleted: 'Workspace deleted',
    wsDeleteFail: 'Delete failed',
    wsEmpty: 'no sessions',
    effort: 'Effort',
    effortDefault: 'Default',
    save: 'Save',
    cancel: 'Cancel',
  }

  // ── markdown (vendored markdown-it; raw HTML disabled) ─────
  var md = null
  try {
    if (window.markdownit) {
      md = window.markdownit({ html: false, linkify: true, breaks: false })
      // CommonMark closes `**` only before whitespace/punctuation, so Chinese
      // `**词**是…` would leak literal stars; the CJK-friendly plugin relaxes
      // that rule for CJK punctuation/characters.
      var cjk = window.markdownitCjkFriendly
      if (cjk) md.use(cjk.default || cjk)
      // Defence in depth: only web/mail links may become anchors/images.
      md.validateLink = function (url) { return /^(https?:|mailto:)/i.test(String(url || '')) }
    }
  } catch (e) { console.error('[md init]', e) }
  function renderMd(text) {
    if (!md) return null
    try { return md.render(text) } catch (e) { return null }
  }

  // ── tiny DOM helpers ────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text !== undefined) n.textContent = text
    return n
  }
  function esc(s) { return String(s == null ? '' : s) }

  // ── RPC layer ───────────────────────────────────────────────
  // rc.1: endpoint = <namespace>/<method>; payload always {args:{named}}.
  // Call sites keep the rc.2-era names/args; this table translates.
  function rpcId() {
    if (crypto.randomUUID) return crypto.randomUUID()
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }

  function wrapReq(p) { return { request: p } }   // controller 方法：args.request
  function wrapSelf(p) { return p }               // 直接命名参数
  var ENDPOINTS = {
    'session.list': ['session/list', function (p) { return { _request: p || {} } }],
    'session.create': ['session/create', wrapReq],
    'session.prompt': ['session/prompt', wrapReq],
    'session.cancel': ['session/cancel', wrapReq],
    'session.selectModel': ['session/selectModel', wrapReq],
    'session.models': ['session/modelCatalog', function () { return {} }],
    'session.page': ['session/page', wrapReq],
    'workspace.create': ['workspace/create', wrapReq],
    'workspace.rename': ['workspace/rename', wrapReq],
    'workspace.delete': ['workspace/delete', wrapReq],
    'workspace.archiveSession': ['workspace/archiveSession', wrapReq],
    'host.listDirectory': ['directoryPicker/list', function (p) { return p || {} }],
    'host.createDirectory': ['directoryPicker/createDirectory', wrapSelf],
    'commands/execute': ['commands/execute', wrapSelf],
    'fileUploads/upload': ['fileUploads/upload', wrapSelf],
    'workspaceFiles/list': ['workspaceFiles/list', wrapSelf],
    'workspaceFiles/readBytes': ['workspaceFiles/readBytes', wrapSelf],
    '$events/result': ['$events/result', wrapSelf],
  }

  function rpc(method, payload) {
    var map = ENDPOINTS[method] || [method, wrapSelf]
    var endpoint = map[0]
    return fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: rpcId(), method: endpoint, payload: { args: map[1](payload || {}) } }),
    }).then(function (r) {
      if (r.status === 401) { gotoLogin(); throw new Error('unauthorized') }
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }).then(function (full) {
      var res = full && full.result
      if (!res) throw new Error('bad envelope')
      if (!res.ok) {
        var e = new Error((res.error && res.error.message) || 'rpc error')
        e.code = res.error && res.error.code
        throw e
      }
      return res.value
    })
  }

  // ── remote.mux: logical streams over one WebSocket ──────────
  // Internal event bus keeps the rc.2 handler registry shape: real frames and
  // probe-injected synthetic frames share the same dispatch.
  var muxHandlers = Object.create(null)
  function onMux(type, fn) { (muxHandlers[type] = muxHandlers[type] || []).push(fn) }
  function dispatchBus(type, a, b) {
    var hs = muxHandlers[type]
    if (!hs) return
    for (var i = 0; i < hs.length; i++) {
      try { hs[i](a, b) } catch (e) { console.error('[mux handler]', e) }
    }
  }

  var muxRetry = 0
  var muxOpen = false
  var muxEverOpen = false
  var muxWs = null
  var connEl = null
  var eventsClientId = null      // $events ready 帧给的 clientId（waterfall 应答用）
  var STREAM_EVENTS = 'ev'       // $events 的 streamId
  var followStreamId = null      // 当前聊天会话的 session/follow streamId

  function setConn(on) {
    muxOpen = !!on
    if (connEl) connEl.classList.toggle('on', muxOpen)
  }

  function wsSend(obj) {
    try { muxWs && muxWs.readyState === 1 && muxWs.send(JSON.stringify(obj)) } catch (e) {}
  }
  function openStream(streamId, endpoint, args) {
    wsSend({ type: 'open', streamId: streamId, endpoint: endpoint, payload: { args: args || {} } })
  }
  function closeStream(streamId) {
    wsSend({ type: 'cancel', streamId: streamId })
  }

  // 当前聊天会话的 follow 流（快照=尾部窗口，之后逐事件推送）
  function openFollow(sessionId) {
    if (followStreamId) closeStream(followStreamId)
    followStreamId = 'sf-' + sessionId
    openStream(followStreamId, 'session/follow', { request: { address: { kind: 'session', sessionId: sessionId } } })
  }
  function closeFollow() {
    if (followStreamId) { closeStream(followStreamId); followStreamId = null }
  }

  function connectMux() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    var ws
    try {
      ws = new WebSocket(proto + '//' + location.host + '/api/remote.mux')
    } catch (e) { scheduleMux(); return }
    muxWs = ws
    ws.onopen = function () {
      var wasDown = muxEverOpen && !muxOpen
      muxRetry = 0
      setConn(true)
      muxEverOpen = true
      openStream(STREAM_EVENTS, '$events', {})
      openStream(STREAM_WS, 'workspace/follow', {})
      // 重连语义：流重开 = 快照重基线（官方契约 reopen+refetch 的 rc.1 形态）
      if (state.view === 'chat' && chat && chat.id) openFollow(chat.id)
      else if (wasDown) scheduleRefresh(true)
    }
    ws.onmessage = function (ev) {
      var f
      try { f = JSON.parse(ev.data) } catch (e) { return }
      if (!f || !f.streamId) return
      if (f.type === 'error') {
        if (followStreamId && f.streamId === followStreamId) onFollowError(f.error)
        return
      }
      if (f.type !== 'item') return
      try {
        ;(window.__frames = window.__frames || []).push((f.value && f.value.type) + ':' + (f.value && (f.value.agentId || (f.value.event && f.value.event.type) || '')))
      } catch (e) {}
      if (f.streamId === STREAM_EVENTS) return onEventsFrame(f.value)
      if (f.streamId === STREAM_WS) return onWorkspaceFrame(f.value)
      if (followStreamId && f.streamId === followStreamId) return onFollowFrame(f.value)
    }
    ws.onclose = function () { setConn(false); followStreamId = null; eventsClientId = null; checkAuth(); scheduleMux() }
    ws.onerror = function () { try { ws.close() } catch (e) {} }
  }
  function scheduleMux() {
    var d = Math.min(15000, 800 * Math.pow(1.6, muxRetry++))
    setTimeout(connectMux, d)
  }

  // ── $events 全局总线帧 ──────────────────────────────────────
  function onEventsFrame(v) {
    if (!v || typeof v.type !== 'string') return
    if (v.type === 'ready') { eventsClientId = v.clientId; return }
    if (v.type === 'cancel') { dispatchBus('waterfall/cancel', v.eventId); return }
    if (v.type === 'waterfall') {
      // 审批/提问：应答走 $events/result（见 answerWaterfall）
      dispatchBus(v.event, v.request, { clientId: eventsClientId, eventId: v.eventId, agentId: v.agentId })
      return
    }
    if (v.type === 'emit') { dispatchBus(v.event, v.args); return }
  }

  // ── 会话 follow 流帧（session/follow）────────────────────────
  function onFollowFrame(v) {
    if (!v || !chat || !followStreamId) return
    var sid = followStreamId.slice(3)
    if (v.type === 'snapshot') {
      if (state.view !== 'chat' || chat.id !== sid) return
      chat.events = v.records || []
      chat.cursor = v.cursor
      chat.hasMore = !!v.hasMore
      chat.projections = (v.projections && v.projections.values) || null
      if (chat.events.length) {
        var first = chat.events[0] && chat.events[0].event
        chat.baseSeq = first && typeof first.seq === 'number' ? first.seq : null
      }
      chat.running = runningOfHeader(v.header)
      onChatSnapshot()
      return
    }
    if (v.type === 'event') {
      // 复用旧总线帧形状，走统一的 seq 去重 + 折叠
      dispatchBus('session/event', { sessionId: sid, event: v.event })
      return
    }
  }
  function runningOfHeader(h) {
    return !!(h && (h.running === true || h.status === 'running'))
  }

  // ── 工作区 follow 流（workspace/follow）：baseline + 增量 ────
  var STREAM_WS = 'ws'
  function applyWorkspaceBaseline(b) {
    state.workspaces = (b && b.items) || []
    state.archived = Object.create(null)
    var ids = (b && b.archivedSessionIds) || []
    for (var i = 0; i < ids.length; i++) state.archived[ids[i]] = true
    rebuildMemberOf()
  }
  function rebuildMemberOf() {
    state.memberOf = Object.create(null)
    for (var wi = 0; wi < state.workspaces.length; wi++) {
      var ws = state.workspaces[wi]
      var ids = ws.sessionIds || []
      for (var si = 0; si < ids.length; si++) state.memberOf[ids[si]] = ws.workspaceId
    }
  }
  function onWorkspaceFrame(v) {
    if (!v || typeof v.type !== 'string') return
    if (v.type === 'baseline') { applyWorkspaceBaseline(v.value); scheduleRefresh(true); return }
    if (v.type === 'upsert') {
      var w = v.workspace
      if (!w) return
      var at = -1
      for (var i = 0; i < state.workspaces.length; i++) if (state.workspaces[i].workspaceId === w.workspaceId) at = i
      if (at >= 0) state.workspaces[at] = w
      else state.workspaces.push(w)
      rebuildMemberOf(); scheduleRefresh(true); return
    }
    if (v.type === 'remove') {
      state.workspaces = state.workspaces.filter(function (x) { return x.workspaceId !== v.workspaceId })
      rebuildMemberOf(); scheduleRefresh(true); return
    }
    if (v.type === 'order') {
      var rank = Object.create(null)
      for (var oi = 0; oi < v.workspaceIds.length; oi++) rank[v.workspaceIds[oi]] = oi
      state.workspaces.sort(function (a, b) { return (rank[a.workspaceId] === undefined ? 999 : rank[a.workspaceId]) - (rank[b.workspaceId] === undefined ? 999 : rank[b.workspaceId]) })
      scheduleRefresh(true); return
    }
    if (v.type === 'archived') {
      state.archived = Object.create(null)
      var ids = v.archivedSessionIds || []
      for (var ai = 0; ai < ids.length; ai++) state.archived[ids[ai]] = true
      scheduleRefresh(true); return
    }
  }

  // ── state ───────────────────────────────────────────────────
  var state = {
    sessions: [],
    byId: Object.create(null),
    titles: Object.create(null),
    cwds: Object.create(null),   // sessionId -> cwd, for sessions created this page-load
    archived: Object.create(null), // sessionId -> true (workspace.list baseline)
    workspaces: [],               // workspace.list items (workspaceId/path/title/sessionIds)
    memberOf: Object.create(null), // sessionId -> workspaceId (official grouping key)
    collapsed: Object.create(null), // group key -> true (folded group)
    view: 'list',
  }

  function sessionTitle(s) {
    var t = state.titles[s.sessionId]
    if (t == null) t = s.projections && s.projections.values && s.projections.values.title
    return t || T.untitled
  }

  function relTime(ts) {
    var diff = Date.now() - ts
    var m = Math.floor(diff / 60000)
    if (m < 1) return T.justNow
    if (m < 60) return m + T.minutesAgo
    var h = Math.floor(m / 60)
    if (h < 24) return h + T.hoursAgo
    return Math.floor(h / 24) + T.daysAgo
  }

  function baseName(p) {
    if (!p) return zh ? '默认工作区' : 'default'
    var parts = String(p).replace(/\/+$/, '').split('/')
    return parts[parts.length - 1] || p
  }

  // Group fold state persists across reloads (localStorage, keyed by cwd).
  var COLLAPSE_KEY = 'dsh-web-mobile-pmsfh:collapsed'
  function loadCollapsed() {
    try {
      var raw = localStorage.getItem(COLLAPSE_KEY)
      var arr = raw ? JSON.parse(raw) : []
      for (var i = 0; i < arr.length; i++) state.collapsed[arr[i]] = true
    } catch (e) {}
  }
  function saveCollapsed() {
    try {
      var keys = []
      for (var k in state.collapsed) if (state.collapsed[k]) keys.push(k)
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(keys))
    } catch (e) {}
  }
  loadCollapsed()

  // ── shared header ───────────────────────────────────────────
  function renderHead(title, opts) {
    opts = opts || {}
    var hd = el('div', 'hd')
    if (opts.back) {
      var back = el('button', 'back', '‹')
      back.setAttribute('aria-label', 'back')
      back.addEventListener('click', function () { location.hash = '#/' })
      hd.appendChild(back)
    }
    hd.appendChild(el('h1', null, title))
    connEl = el('span', 'conn')
    if (muxOpen) connEl.classList.add('on')
    hd.appendChild(connEl)
    if (opts.refresh) {
      var rf = el('button', null)
      rf.appendChild(refreshIcon())
      rf.setAttribute('aria-label', 'refresh')
      rf.addEventListener('click', loadList)
      hd.appendChild(rf)
    }
    if (opts.add) {
      var add = el('button', null)
      add.appendChild(plusIcon())
      add.setAttribute('aria-label', T.newSession)
      add.addEventListener('click', createSession)
      hd.appendChild(add)
    }
    if (opts.menu) {
      var mn = el('button', null, '⋯')
      mn.setAttribute('aria-label', T.account)
      mn.addEventListener('click', openAccountSheet)
      hd.appendChild(mn)
    }
    return hd
  }

  // ── auth：dsh-auth-gate 会话辅助 ────────────────────────────
  // 移动页在 gate 之后：未登录时导航会被 302 到登录页，但页面内的 fetch/WS
  // 只会收到 401。这里统一做「过期即回登录页」与「退出登录」。
  var authRedirecting = false
  var lastAuthCheck = 0
  function gotoLogin() {
    if (authRedirecting) return
    authRedirecting = true
    var next = location.pathname || '/dsh-web-mobile-pmsfh/'
    location.href = '/auth/login?next=' + encodeURIComponent(next)
  }
  function checkAuth() {
    if (Date.now() - lastAuthCheck < 10000) return
    lastAuthCheck = Date.now()
    fetch('/auth/status', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (v) { if (v && v.authenticated === false) gotoLogin() })
      .catch(function () {})
  }
  function openAccountSheet() {
    openSheet(function (sheet) {
      sheet.appendChild(el('div', 'sheet-title', T.account))
      var out = el('button', 'sheet-item', T.logout)
      out.addEventListener('click', function () {
        closeSheet()
        // gate 的 /auth/logout 只接受 POST：用原生 form 提交，零 JS 依赖。
        var f = document.createElement('form')
        f.method = 'POST'
        f.action = '/auth/logout?next=' + encodeURIComponent('/dsh-web-mobile-pmsfh/')
        document.body.appendChild(f)
        f.submit()
      })
      sheet.appendChild(out)
    })
  }

  // Header icons are inline SVG, not text glyphs: the visible ink of '⟳' and
  // '＋' sits at font-dependent offsets inside their em boxes (Android vs iOS
  // vs desktop fonts all differ), which produced a 1–2px misalignment that
  // flex-centering could not fix. SVG geometry is identical on every font.
  var SVG_NS = 'http://www.w3.org/2000/svg'
  function svgIcon(build) {
    var svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', '22')
    svg.setAttribute('height', '22')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.style.display = 'block'
    build(svg)
    return svg
  }
  function svgPath(svg, d) {
    var p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  function refreshIcon() {
    // Ring radius 7 (14px) + arrow, whole glyph smaller than the 16px plus so
    // the ring+arrowhead mass reads equal to the cross (user: refresh looked bigger).
    return svgIcon(function (svg) {
      svgPath(svg, 'M19 12a7 7 0 1 1-7-7c1.9 0 3.8 0.8 5.2 2.1L19 8')
      svgPath(svg, 'M19 4v4h-4')
    })
  }
  function plusIcon() {
    return svgIcon(function (svg) {
      // 16px across.
      svgPath(svg, 'M4 12h16')
      svgPath(svg, 'M12 4v16')
    })
  }

  // ── list view ───────────────────────────────────────────────
  function loadList() {
    if (state.view !== 'list') return // chat owns the DOM; list reloads on return
    renderListLoading()
    // 工作区数据由 workspace/follow 流喂进 state（baseline+增量，掉线重开重基线）；
    // 会话列表走一元 RPC。工作区流失败只表现为「全在未分组」，列表照出。
    rpc('session.list', {}).then(function (v) {
      if (state.view !== 'list') return // a chat opened mid-flight; never stomp it
      state.sessions = (v && v.items) || []
      state.byId = Object.create(null)
      for (var i = 0; i < state.sessions.length; i++) {
        state.byId[state.sessions[i].sessionId] = state.sessions[i]
      }
      renderList()
    }).catch(function (e) {
      console.error('[list]', e)
      if (state.view === 'list') renderListError()
    })
  }

  function renderListLoading() {
    var app = document.getElementById('app')
    app.textContent = ''
    app.appendChild(renderHead(T.title, { refresh: true, add: true, menu: true }))
    app.appendChild(el('div', 'loading', T.loading))
  }

  function renderListError() {
    var app = document.getElementById('app')
    app.textContent = ''
    app.appendChild(renderHead(T.title, { refresh: true, add: true, menu: true }))
    app.appendChild(el('div', 'err', T.loadFail))
  }

  // Long-press (>=500ms hold, <=10px drift) fires onFire once. Returns a
  // handle whose wasFired() stays true briefly after finger-up, so the
  // element's click handler can swallow the trailing synthesized tap.
  function attachLongPress(node, onFire) {
    var lpT = null
    var sx = 0
    var sy = 0
    var fired = false
    node.addEventListener('touchstart', function (ev) {
      var t = ev.touches[0]
      sx = t.clientX; sy = t.clientY
      fired = false
      clearTimeout(lpT)
      lpT = setTimeout(function () { fired = true; onFire() }, 500)
    }, { passive: true })
    node.addEventListener('touchmove', function (ev) {
      var t = ev.touches[0]
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clearTimeout(lpT)
    }, { passive: true })
    node.addEventListener('touchend', function () {
      clearTimeout(lpT)
      if (fired) setTimeout(function () { fired = false }, 400)
    }, { passive: true })
    node.addEventListener('touchcancel', function () { clearTimeout(lpT) }, { passive: true })
    return { wasFired: function () { return fired } }
  }

  function renderList() {
    var app = document.getElementById('app')
    app.textContent = ''
    app.appendChild(renderHead(T.title, { refresh: true, add: true, menu: true }))
    var list = el('div', 'list')

    // Hide blank sessions, archived sessions AND subagent sessions (official
    // sidebar semantics: subagent runs belong to their parent conversation and
    // never get a top-level row; archived stay in workspace accounting only).
    var rows = state.sessions.filter(function (s) {
      return !s.blank && !state.archived[s.sessionId] && s.origin !== 'subagent' && !s.parentSessionId
    })
    rows.sort(function (a, b) { return b.updatedAt - a.updatedAt })

    if (rows.length === 0 && state.workspaces.length === 0) {
      var em = el('div', 'empty')
      em.appendChild(el('div', 'big', '🏕'))
      em.appendChild(el('div', null, T.empty))
      list.appendChild(em)
    } else {
      // Group by workspace MEMBERSHIP (workspace.list sessionIds) — the same
      // key the official grouping surface uses — not by cwd. Non-member
      // sessions trail in an "Ungrouped" bucket (official order: last).
      var gIdx = Object.create(null)
      var groups = []
      for (var gi0 = 0; gi0 < state.workspaces.length; gi0++) {
        var ws0 = state.workspaces[gi0]
        gIdx[ws0.workspaceId] = { key: ws0.workspaceId, name: ws0.title || baseName(ws0.path), items: [] }
      }
      var ungrouped = { key: 'ungrouped', name: T.ungrouped, items: [] }
      for (var i = 0; i < rows.length; i++) {
        var s = rows[i]
        var g = gIdx[state.memberOf[s.sessionId]] || ungrouped
        g.items.push(s)
      }
      for (var gi = 0; gi < state.workspaces.length; gi++) {
        var gp = gIdx[state.workspaces[gi].workspaceId]
        gp.ws = state.workspaces[gi]
        groups.push(gp) // v2.5: empty workspaces render too (with a hint)
      }
      if (ungrouped.items.length) groups.push(ungrouped)
      for (var gi = 0; gi < groups.length; gi++) {
        (function (g) {
          var box = el('div', 'ws-group')
          var folded = !!state.collapsed[g.key]
          // Collapsible group header, mirrors the official sidebar's fold UX:
          // chevron + name; while folded it also shows the session count.
          var head = el('button', 'ws-head')
          var chev = el('span', 'ws-chev' + (folded ? ' fold' : ''), '›')
          head.appendChild(chev)
          head.appendChild(el('span', 'ws-name', g.name))
          if (folded) head.appendChild(el('span', 'ws-count', String(g.items.length)))
          head.setAttribute('aria-expanded', folded ? 'false' : 'true')
          head.addEventListener('click', function () {
            if (headLp.wasFired()) return // long-press already opened the ws sheet
            if (state.collapsed[g.key]) delete state.collapsed[g.key]
            else state.collapsed[g.key] = true
            saveCollapsed()
            renderList()
          })
          // Workspace groups: long-press the header for rename/delete (the
          // Ungrouped bucket is not a workspace and has nothing to manage).
          var headLp = g.ws
            ? attachLongPress(head, function () { openWorkspaceSheet(g.ws) })
            : { wasFired: function () { return false } }
          box.appendChild(head)
          if (!g.items.length && !folded) {
            // Empty workspaces are visible since v2.5 (just-created ones must
            // not look lost) — a quiet hint instead of rows. While folded the
            // hint is hidden too (the folded header's count badge is enough).
            box.appendChild(el('div', 'ws-empty-hint', T.wsEmpty))
          }
          for (var j = 0; j < g.items.length; j++) {
            (function (s) {
              var row = el('button', 'srow')
              row.appendChild(el('span', 'dot' + (s.running ? ' run' : '')))
              var body = el('span', 'body')
              body.appendChild(el('div', 't', sessionTitle(s)))
              var meta = relTime(s.updatedAt) + (s.running ? ' · ' + T.running : '')
              body.appendChild(el('div', 'm', meta))
              row.appendChild(body)
              row.appendChild(el('span', 'go', '›'))
              row.addEventListener('click', function () {
                if (rowLp.wasFired()) return // long-press already acted
                location.hash = '#/s/' + encodeURIComponent(s.sessionId)
              })
              // Long-press (>=500ms, no significant move) opens the row sheet
              // (archive); the trailing synthesized tap is swallowed once.
              var rowLp = attachLongPress(row, function () { openSessionSheet(s) })
              box.appendChild(row)
            })(g.items[j])
          }
          if (folded) box.classList.add('folded')
          list.appendChild(box)
        })(groups[gi])
      }
    }

    var dl = el('a', 'desktop-link', T.desktop)
    dl.href = '/'
    dl.addEventListener('click', function (ev) {
      ev.preventDefault()
      // Session-scoped escape: next fresh visit defaults back to mobile.
      try { sessionStorage.setItem('dsh-web-mobile-pmsfh:desktop', '1') } catch (e) {}
      try { localStorage.removeItem('dsh-web-mobile-pmsfh:desktop') } catch (e) {}
      location.href = '/'
    })
    list.appendChild(dl)
    app.appendChild(list)
  }

  // ── session row sheet (long-press): archive ─────────────────
  function openSessionSheet(s) {
    openSheet(function (sheet) {
      // Menu caption is fixed (a raw session title reads like page content);
      // the actual session title stays as a secondary line for confirmation.
      sheet.appendChild(el('div', 'sheet-title', T.sessionActions))
      sheet.appendChild(el('div', 'ws-sub', sessionTitle(s)))
      var ar = el('button', 'sheet-item', '📥 ' + T.archive)
      ar.addEventListener('click', function () {
        closeSheet()
        rpc('workspace.archiveSession', { sessionId: s.sessionId }).then(function (v) {
          var ids = (v && v.archivedSessionIds) || []
          state.archived = Object.create(null)
          for (var i = 0; i < ids.length; i++) state.archived[ids[i]] = true
          toast(T.archived)
          if (state.view === 'list') renderList()
        }).catch(function (e) {
          console.error('[archive]', e)
          toast(T.archiveFail)
        })
      })
      sheet.appendChild(ar)
    })
  }

  // ── workspace sheet (long-press group header): rename/delete ─
  function openWorkspaceSheet(ws) {
    openSheet(function (sheet) {
      sheet.appendChild(el('div', 'sheet-title', ws.title || baseName(ws.path)))
      sheet.appendChild(el('div', 'ws-sub', ws.path))

      var rn = el('button', 'sheet-item', '✏️ ' + T.wsRename)
      rn.addEventListener('click', function () { renderRename(sheet, ws) })
      sheet.appendChild(rn)

      var del = el('button', 'sheet-item danger', '🗑 ' + T.wsDelete)
      del.addEventListener('click', function () {
        closeSheet()
        confirmDialog(T.wsDelete, T.wsDeleteDesc.replace('{name}', ws.title || baseName(ws.path)), T.wsDelete, function () {
          rpc('workspace.delete', { workspaceId: ws.workspaceId }).then(function () {
            toast(T.wsDeleted)
            if (state.view === 'list') loadList()
          }).catch(function (e) {
            console.error('[ws delete]', e)
            toast(T.wsDeleteFail)
          })
        })
      })
      sheet.appendChild(del)
    })
  }

  function renderRename(sheet, ws) {
    sheet.textContent = ''
    sheet.appendChild(el('div', 'sheet-title', T.wsRename))
    var inp = el('input', 'q-custom')
    inp.value = ws.title || ''
    sheet.appendChild(inp)
    var acts = el('div', 'sheet-actions')
    var cancel = el('button', 'btn-ghost', T.cancel)
    cancel.addEventListener('click', function () { openWorkspaceSheet(ws) })
    var save = el('button', 'btn-primary', T.save)
    save.disabled = !(ws.title || '').trim()
    inp.addEventListener('input', function () { save.disabled = !inp.value.trim() })
    save.addEventListener('click', function () {
      var title = inp.value.trim()
      if (!title) return
      save.disabled = true
      rpc('workspace.rename', { workspaceId: ws.workspaceId, title: title }).then(function () {
        toast(T.wsRenamed)
        closeSheet()
        if (state.view === 'list') loadList()
      }).catch(function (e) {
        console.error('[ws rename]', e)
        save.disabled = false
        toast(T.wsRenameFail)
      })
    })
    acts.appendChild(cancel)
    acts.appendChild(save)
    sheet.appendChild(acts)
    setTimeout(function () { inp.focus() }, 60)
  }

  // Generic confirm dialog (workspace delete gate). Official wording comes
  // from the caller; the danger action needs an explicit confirm tap.
  function confirmDialog(title, desc, actionLabel, onYes) {
    var mask = el('div', 'mask')
    var box = el('div', 'cs-confirm')
    box.appendChild(el('div', 'cs-confirm-title', title))
    box.appendChild(el('div', 'cs-confirm-desc', desc))
    var actions = el('div', 'sheet-actions')
    var cancel = el('button', 'btn-ghost', T.cancel)
    cancel.addEventListener('click', function () { mask.remove() })
    var ok = el('button', 'btn-primary btn-danger', actionLabel)
    ok.addEventListener('click', function () { mask.remove(); onYes() })
    actions.appendChild(cancel)
    actions.appendChild(ok)
    box.appendChild(actions)
    mask.appendChild(box)
    mask.addEventListener('click', function (ev) { if (ev.target === mask) mask.remove() })
    document.body.appendChild(mask)
  }

  // ── new-session sheet (workspace + permission; v2.5 adds inline
  //    workspace creation via directory browser, drops the Ungrouped
  //    create option) ─────────────────────────────────────────────
  // One sheet settles both session attributes up front, mirroring the
  // official desktop surface (workspace picker beside the permission
  // selector). Differences from desktop, by user design decision:
  //   - permission has NO default: one of the three presets must be
  //     picked explicitly or the Create button stays disabled;
  //   - agentPreset (mode) is never offered — sessions always start in
  //     the system-standard preset (isDefault), passed explicitly.
  var PERMS = [
    { value: 'read-only', descKey: 'permReadOnlyDesc' },
    { value: 'workspace-write', descKey: 'permWorkspaceWriteDesc' },
    { value: 'danger-full-access', descKey: 'permFullAccessDesc', risky: true },
  ]

  function permLabel(value) {
    // Same product labels as the official UI: title-cased names, but the
    // dangerous preset is always marketed as "Full access".
    if (value === 'danger-full-access') return 'Full access'
    return value.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1) }).join(' ')
  }

  function createSession() {
    openCreateSheet(null, null)
  }

  // v2.5: sessions MUST belong to a workspace — the "Ungrouped" create option
  // is gone; the sheet instead offers an inline directory browser that
  // registers a new workspace. host.pickDirectory is unusable on this
  // headless deployment (it pops a native OS dialog nobody can click), so
  // browsing goes through host.listDirectory / host.createDirectory +
  // workspace.create, mirroring the official desktop directory browser.
  // preselectWsId/keepPerm carry the user's choices across the round trip
  // through the directory browser (perm would otherwise be lost).
  function openCreateSheet(preselectWsId, keepPerm) {
    // A session only BELONGS to a workspace when created with workspaceId —
    // passing cwd alone leaves it unaffiliated (renders as "Ungrouped").
    // rc.1: 工作区清单直接读 workspace/follow 流喂的 state（开机即 baseline，
    // 增量实时），无需再发一次性 RPC。
    var chosen = { ws: null, perm: keepPerm || null } // ws: payload fragment; perm: preset value
    buildSheet(state.workspaces, false)

    function buildSheet(wss, wsFailed) {
      openSheet(function (sheet) {
        sheet.appendChild(el('div', 'sheet-title', T.newSession))

        sheet.appendChild(el('div', 'cs-section', T.wsSection))
        if (wsFailed) {
          sheet.appendChild(el('div', 'cs-note', T.wsListFail))
        }
        var preselectBtn = null
        var preselectWs = null
        for (var i = 0; i < wss.length; i++) {
          (function (ws) {
            var b = el('button', 'sheet-item cs-ws')
            b.appendChild(el('div', null, ws.title || baseName(ws.path)))
            b.appendChild(el('div', 'ws-sub', ws.path))
            b.addEventListener('click', function () { pickWs(b, { workspaceId: ws.workspaceId }, ws.path) })
            sheet.appendChild(b)
            if (preselectWsId && ws.workspaceId === preselectWsId) { preselectBtn = b; preselectWs = ws }
          })(wss[i])
        }
        var addWs = el('button', 'sheet-item cs-ws-new')
        addWs.appendChild(el('div', null, T.wsNew))
        addWs.appendChild(el('div', 'ws-sub', T.wsNewHint))
        addWs.addEventListener('click', function () { renderDirBrowser(sheet) })
        sheet.appendChild(addWs)

        var permHead = el('div', 'cs-section')
        permHead.appendChild(el('span', null, T.permTitle))
        permHead.appendChild(el('span', 'cs-required', T.permRequired))
        sheet.appendChild(permHead)
        for (var j = 0; j < PERMS.length; j++) {
          (function (p) {
            var b = el('button', 'sheet-item cs-perm')
            b.appendChild(el('div', null, permLabel(p.value)))
            b.appendChild(el('div', 'ws-sub', T[p.descKey]))
            b.addEventListener('click', function () { pickPerm(b, p.value) })
            sheet.appendChild(b)
          })(PERMS[j])
        }

        var createBtn = el('button', 'btn-primary cs-create')
        createBtn.disabled = true
        createBtn.textContent = T.create
        createBtn.addEventListener('click', function () {
          if (!chosen.perm) return
          closeSheet()
          doCreate(chosen)
        })
        sheet.appendChild(createBtn)
        // Auto-select the freshly created workspace AFTER createBtn exists
        // (pickWs touches createBtn via refresh()).
        if (preselectBtn && preselectWs) {
          pickWs(preselectBtn, { workspaceId: preselectWs.workspaceId }, preselectWs.path)
        }
        if (chosen.perm) markPerm()
        refresh()

        function pickWs(btn, payload, path) {
          chosen.ws = payload
          chosen.wsPath = path
          mark(btn, 'cs-ws')
          refresh()
        }
        function pickPerm(btn, value) {
          if (value === 'danger-full-access') {
            confirmFullAccess(function () {
              chosen.perm = value
              mark(btn, 'cs-perm')
              refresh()
            })
            return
          }
          chosen.perm = value
          mark(btn, 'cs-perm')
          refresh()
        }
        function markPerm() {
          // Restore the kept perm's highlight after returning from the
          // directory browser (rows are rebuilt, so re-mark by value).
          var all = sheet.querySelectorAll('.cs-perm')
          for (var k = 0; k < all.length; k++) {
            var label = all[k].firstChild ? all[k].firstChild.textContent : ''
            if (label === permLabel(chosen.perm)) all[k].classList.add('active')
          }
        }
        function mark(btn, cls) {
          var all = sheet.querySelectorAll('.' + cls)
          for (var k = 0; k < all.length; k++) all[k].classList.remove('active')
          btn.classList.add('active')
        }
        function refresh() {
          createBtn.disabled = !chosen.ws || !chosen.perm
        }
      })
    }

    // Directory browser rendered INSIDE the same sheet (no nested mask):
    // list one level, drill down, go up via crumbs, create child folders,
    // and register the current directory as a workspace.
    function renderDirBrowser(sheet) {
      loadDir(null) // null = host home directory

      function loadDir(path) {
        sheet.textContent = ''
        sheet.appendChild(el('div', 'sheet-title', T.dirTitle))
        sheet.appendChild(el('div', 'sheet-empty', T.loading))
        rpc('host.listDirectory', path ? { path: path } : {}).then(function (v) {
          paintListing(v)
        }).catch(function (e) {
          console.error('[dir]', e)
          sheet.textContent = ''
          sheet.appendChild(el('div', 'sheet-title', T.dirTitle))
          sheet.appendChild(el('div', 'sheet-empty', T.dirFail))
          var back = el('button', 'btn-ghost cs-create', T.dirBack)
          back.addEventListener('click', function () {
            openCreateSheet(chosen.ws && chosen.ws.workspaceId, chosen.perm)
          })
          sheet.appendChild(back)
        })
      }

      function paintListing(v) {
        sheet.textContent = ''
        sheet.appendChild(el('div', 'sheet-title', T.dirTitle))
        sheet.appendChild(el('div', 'ws-sub dir-path', v.path))

        if (v.crumbs.length > 1) {
          var parent = v.crumbs[v.crumbs.length - 2]
          var up = el('button', 'sheet-item dir-row', '⬆ ' + (parent.name || '/'))
          up.addEventListener('click', function () { loadDir(parent.path) })
          sheet.appendChild(up)
        }

        var count = 0
        for (var i = 0; i < v.entries.length; i++) {
          (function (e) {
            if (e.hidden) return // dot-led dirs stay out by default (official default)
            count++
            var row = el('button', 'sheet-item dir-row', '📁 ' + e.name)
            row.addEventListener('click', function () { loadDir(e.path) })
            sheet.appendChild(row)
          })(v.entries[i])
        }
        if (count === 0) sheet.appendChild(el('div', 'sheet-empty', T.dirEmpty))
        if (v.truncated) sheet.appendChild(el('div', 'cs-note', T.dirTruncated))

        // New child folder: inline name form, created via host.createDirectory.
        var nfBtn = el('button', 'sheet-item dir-row', '➕ ' + T.dirNewFolder)
        var nfForm = null
        nfBtn.addEventListener('click', function () {
          if (nfForm) return
          nfForm = el('div', 'dir-newform')
          var inp = el('input', 'q-custom')
          inp.placeholder = T.dirNewFolder
          nfForm.appendChild(inp)
          var mk = el('button', 'btn-primary dir-mk', T.dirCreate)
          mk.addEventListener('click', function () {
            var name = inp.value.trim()
            // Server enforces the same rule; fail fast client-side.
            if (!name || name === '.' || name === '..' || /[/\\]/.test(name)) return
            mk.disabled = true
            rpc('host.createDirectory', { path: v.path, name: name }).then(function () {
              loadDir(v.path) // re-list to surface the new folder
            }).catch(function (e) {
              console.error('[mkdir]', e)
              mk.disabled = false
              toast(T.dirFail)
            })
          })
          nfForm.appendChild(mk)
          nfBtn.parentNode.insertBefore(nfForm, nfBtn.nextSibling)
          setTimeout(function () { inp.focus() }, 60)
        })
        sheet.appendChild(nfBtn)

        var use = el('button', 'btn-primary cs-create', T.dirUse)
        use.addEventListener('click', function () {
          use.disabled = true
          rpc('workspace.create', { path: v.path }).then(function (r) {
            var ws = r && r.workspace
            if (!ws) { toast(T.wsCreateFail); use.disabled = false; return }
            if (state.view === 'list') loadList() // refresh the list behind the sheet
            // Back to the session sheet; the new workspace is pre-selected,
            // the kept permission survives the round trip.
            openCreateSheet(ws.workspaceId, chosen.perm)
          }).catch(function (e) {
            console.error('[ws create]', e)
            use.disabled = false
            toast(T.wsCreateFail)
          })
        })
        sheet.appendChild(use)
      }
    }
  }

  // Full access keeps the official risk gate: an explicit acknowledge
  // dialog before the preset can be applied (desktop wording, verbatim).
  function confirmFullAccess(onYes) {
    var mask = el('div', 'mask')
    var box = el('div', 'cs-confirm')
    box.appendChild(el('div', 'cs-confirm-title', T.faTitle))
    box.appendChild(el('div', 'cs-confirm-desc', T.faDesc))
    var ack = el('label', 'cs-ack')
    var cb = el('input', 'cs-ack-box')
    cb.type = 'checkbox'
    ack.appendChild(cb)
    ack.appendChild(el('span', null, T.faAck))
    box.appendChild(ack)
    var actions = el('div', 'sheet-actions')
    var cancel = el('button', 'btn-ghost')
    cancel.textContent = T.faCancel
    var enable = el('button', 'btn-primary')
    enable.textContent = T.faEnable
    enable.disabled = true
    cb.addEventListener('change', function () { enable.disabled = !cb.checked })
    cancel.addEventListener('click', function () { mask.remove() })
    enable.addEventListener('click', function () { mask.remove(); onYes() })
    actions.appendChild(cancel)
    actions.appendChild(enable)
    box.appendChild(actions)
    mask.appendChild(box)
    mask.addEventListener('click', function (ev) { if (ev.target === mask) mask.remove() })
    document.body.appendChild(mask)
  }

  function doCreate(chosen) {
    var payload = chosen.ws
    // Mode is fixed to the standard system preset — never a user choice on
    // the mobile surface (desktop offers four presets; mobile stays standard).
    payload.agentPreset = 'standard'
    rpc('session.create', payload).then(function (v) {
      if (!v || !v.sessionId) return
      if (chosen.wsPath) state.cwds[v.sessionId] = chosen.wsPath // server sets cwd = workspace path
      if (payload.workspaceId) state.memberOf[v.sessionId] = payload.workspaceId
      var sid = v.sessionId
      // Land the permission BEFORE opening the chat, so the first message the
      // user types can never outrun the preset switch.
      applyPerm(sid, chosen.perm).then(function () {
        location.hash = '#/s/' + encodeURIComponent(sid)
      })
    }).catch(function (e) { console.error('[create]', e); toast(T.createFail) })
  }

  // Permission lands via the commands RPC, not session.prompt — slash lines
  // sent through session.prompt are NOT intercepted and reach the model as
  // plain text (burns tokens, no effect). commands/execute applies the preset
  // cleanly: permission/preset event only, no turn. 0.2.2: attachment field is
  // `submittedAttachments` (rc.1 called it `images`).
  function applyPerm(sid, preset) {
    return rpc('commands/execute', { agentId: sid, line: '/permission ' + preset, submittedAttachments: [] })
      .catch(function (e) { console.error('[permission]', e); toast(T.permFail) })
  }

  // ══════════════════ chat view (phase 2) ═════════════════════
  //
  // Fold state per open chat: history window + live stitching by seq.
  //   chat.events   folded {event, view} entries in seq order
  //   chat.maxSeq   largest folded seq; live frames at or below it are dupes
  //   chat.baseSeq  smallest seq in the window (loadOlder anchor)
  //   chat.hasMore  older pages exist
  //   chat.steps    live step bubbles keyed 'turn:step'
  //   chat.cards    tool cards keyed by callId
  var chat = null

  function textOfBlocks(content) {
    if (typeof content === 'string') return content
    if (!content || !content.length) return ''
    var out = []
    for (var i = 0; i < content.length; i++) {
      var b = content[i]
      if (b && b.type === 'text' && b.text) out.push(b.text)
    }
    return out.join('\n')
  }
  function reasoningOfBlocks(content) {
    if (!content || !content.length) return ''
    var out = []
    for (var i = 0; i < content.length; i++) {
      var b = content[i]
      if (b && b.type === 'reasoning' && b.text) out.push(b.text)
    }
    return out.join('\n')
  }

  function nearBottom(box) {
    return box.scrollHeight - box.scrollTop - box.clientHeight < 140
  }
  function scrollBottom(box) { box.scrollTop = box.scrollHeight }
  function maybeScroll(box) { if (nearBottom(box)) scrollBottom(box) }

  function stepKey(turn, step) { return turn + ':' + step }

  // Create or reuse the live assistant bubble for one step.
  function stepBubble(turn, step) {
    var key = stepKey(turn, step)
    var st = chat.steps[key]
    if (st) return st
    var node = el('div', 'msg assistant live')
    var body = el('div', 'md')
    node.appendChild(body)
    chat.box.appendChild(node)
    st = { node: node, body: body, texts: Object.create(null), reasoning: Object.create(null), reasonEl: null }
    chat.steps[key] = st
    return st
  }

  function liveText(st) {
    var idx = Object.keys(st.texts).sort(function (a, b) { return a - b })
    var out = []
    for (var i = 0; i < idx.length; i++) out.push(st.texts[idx[i]])
    return out.join('')
  }
  function liveReasoning(st) {
    var idx = Object.keys(st.reasoning).sort(function (a, b) { return a - b })
    var out = []
    for (var i = 0; i < idx.length; i++) out.push(st.reasoning[idx[i]])
    return out.join('')
  }

  function paintLiveStep(st) {
    // plain text while streaming (markdown lands on the final message event)
    st.body.textContent = liveText(st)
    var r = liveReasoning(st)
    if (r) {
      if (!st.reasonEl) {
        var det = el('details', 'reasoning')
        det.appendChild(el('summary', null, T.thinkingLive))
        st.reasonEl = el('div', 'reasoning-body')
        det.appendChild(st.reasonEl)
        st.node.insertBefore(det, st.body)
        st.reasonDet = det
      }
      st.reasonEl.textContent = r
    }
    syncStepChrome(st, liveText(st), !!r)
  }

  /**
   * Steps that carried only reasoning (or only tool calls) would otherwise
   * leave a bordered, padded bubble with nothing inside — that is the blank
   * gap users see between two collapsed "思考过程" rows. `bare` drops the
   * bubble chrome when there is nothing to show but the reasoning fold;
   * `empty` removes the node entirely when neither text nor reasoning exists.
   */
  function syncStepChrome(st, text, hasReason) {
    st.node.classList.toggle('bare', !text && hasReason)
    st.node.classList.toggle('empty', !text && !hasReason)
  }

  function finalizeStep(turn, step, message, interrupted) {
    var key = stepKey(turn, step)
    var st = chat.steps[key]
    if (!st) st = stepBubble(turn, step)
    var text = textOfBlocks(message && message.content)
    var reason = reasoningOfBlocks(message && message.content)
    var html = text ? renderMd(text) : null
    if (html) st.body.innerHTML = html
    else st.body.textContent = text
    if (reason) {
      if (!st.reasonEl) {
        var det = el('details', 'reasoning')
        det.appendChild(el('summary', null, T.thinking))
        st.reasonEl = el('div', 'reasoning-body')
        det.appendChild(st.reasonEl)
        st.node.insertBefore(det, st.body)
        st.reasonDet = det
      }
      st.reasonEl.textContent = reason
      st.reasonDet.querySelector('summary').textContent = T.thinking
    }
    st.node.classList.remove('live')
    syncStepChrome(st, text, !!reason)
    if (interrupted) st.node.appendChild(el('div', 'stopped', T.stopped))
    delete chat.steps[key]
  }

  function argsSummary(name, argsStr) {
    var a
    try { a = JSON.parse(argsStr) } catch (e) { return '' }
    if (!a || typeof a !== 'object') return ''
    if (typeof a.command === 'string') return a.command
    if (typeof a.path === 'string') return a.path
    if (typeof a.file_path === 'string') return a.file_path
    if (typeof a.query === 'string') return a.query
    if (typeof a.url === 'string') return a.url
    if (typeof a.pattern === 'string') return a.pattern
    return ''
  }

  function toolCard(callId) {
    var c = chat.cards[callId]
    if (c) return c
    var node = el('div', 'tcard')
    var head = el('button', 'tc-head')
    var ico = el('span', 'tc-ico', '⚙')
    var nm = el('span', 'tc-name', '')
    var sum = el('span', 'tc-sum', '')
    var stEl = el('span', 'tc-st', '…')
    head.appendChild(ico); head.appendChild(nm); head.appendChild(sum); head.appendChild(stEl)
    var body = el('div', 'tc-body')
    body.hidden = true
    head.addEventListener('click', function () { body.hidden = !body.hidden })
    node.appendChild(head); node.appendChild(body)
    chat.box.appendChild(node)
    c = { node: node, name: nm, sum: sum, st: stEl, body: body, args: '' }
    chat.cards[callId] = c
    return c
  }

  function paintToolResult(card, text, isError) {
    card.st.textContent = isError ? '✗' : '✓'
    card.st.classList.add(isError ? 'bad' : 'ok')
    card.node.classList.add(isError ? 'bad' : 'done')
    var t = (text || '').trim()
    if (t.length > 4000) t = t.slice(0, 4000) + '\n…'
    if (t) {
      var pre = el('pre', 'tc-result')
      pre.textContent = t
      card.body.appendChild(pre)
    }
  }

  // Fold one entry (history {event, view} or live mux frame) into the DOM.
  function foldEvent(entry) {
    var ev = entry && entry.event ? entry.event : entry
    if (!ev || !ev.type) return
    var d = ev.data || {}
    switch (ev.type) {
      // rc.1 历史打包行：text/reasoning 增量按 run 打包（seq0 起连续成员共享
      // index），展开等价于逐条 delta 落进同一个 step 泡。tool-call-chunks
      // 不用展开——工具卡片由独立的 tool/call 事件携带。
      case 'chunkrow/text-chunks': {
        var stp = stepBubble(d.turn, d.step)
        stp.texts[d.index] = (stp.texts[d.index] || '') + (d.texts || []).join('')
        paintLiveStep(stp)
        break
      }
      case 'chunkrow/reasoning-chunks': {
        var str = stepBubble(d.turn, d.step)
        str.reasoning[d.index] = (str.reasoning[d.index] || '') + (d.texts || []).join('')
        paintLiveStep(str)
        break
      }
      case 'chunkrow/tool-call-chunks': break
      case 'user/message': {
        // Only human prompts render as bubbles. Injected context (runtime
        // snapshots, policy notices, AGENTS.md, cron notices) carries
        // source.kind 'plugin' — showing it as a user bubble both leaks
        // internals and breaks the user/assistant visual split.
        var kind = d.source && d.source.kind
        if (kind && kind !== 'user') break
        var ut = textOfBlocks(d.content)
        if (ut) {
          var en = chat.box.querySelector('.empty-note')
          if (en) en.remove()
          chat.box.appendChild(el('div', 'msg user', ut))
          maybeScroll(chat.box)
        }
        break
      }
      case 'assistant/chunk': {
        var c = d.chunk
        if (!c) break
        var st = stepBubble(d.turn, d.step)
        if (c.type === 'text-delta') {
          st.texts[c.index] = (st.texts[c.index] || '') + c.text
          paintLiveStep(st)
          maybeScroll(chat.box)
        } else if (c.type === 'reasoning-delta') {
          st.reasoning[c.index] = (st.reasoning[c.index] || '') + c.text
          paintLiveStep(st)
          maybeScroll(chat.box)
        }
        break
      }
      case 'assistant/message': {
        finalizeStep(d.turn, d.step, d.message, d.interrupted)
        maybeScroll(chat.box)
        break
      }
      case 'tool/call': {
        var card = toolCard(d.callId)
        card.name.textContent = esc(d.name)
        card.args = d.arguments || ''
        card.sum.textContent = argsSummary(d.name, card.args)
        break
      }
      case 'tool/result': {
        // Correlation lives on the inner ToolResultBlock (message.content[0]
        // .toolCallId), NOT on the event data — verified against live history.
        var blocks = d.message && d.message.content
        var rb = blocks && blocks[0]
        var bid = rb && rb.toolCallId
        if (bid == null) break
        var isErr = !!d.error || !!rb.isError
        var rc = toolCard(bid)
        paintToolResult(rc, textOfBlocks(rb.content), isErr)
        maybeScroll(chat.box)
        break
      }
      case 'session/title': {
        if (d.title && chat.id) {
          state.titles[chat.id] = d.title
          var h1 = document.querySelector('.hd h1')
          if (h1) h1.textContent = d.title
        }
        break
      }
      case 'compaction/summary': {
        chat.box.appendChild(el('div', 'chatnote', T.compacted))
        break
      }
      case 'turn/start': {
        chat.running = true
        paintComposer()
        break
      }
      case 'turn/end': {
        chat.running = false
        paintComposer()
        break
      }
      default: break // step markers, request/*, todo/write: not rendered
    }
  }

  /**
   * A static history replay feeds `chunkrow/*` frames through paintLiveStep(),
   * which paints plain text while streaming. Once the replay is done the text
   * is final, so upgrade every replayed bubble to markdown in one pass instead
   * of leaving `**`/`##` literals on screen.
   */
  function renderHistoricalSteps() {
    var keys = Object.keys(chat.steps)
    for (var i = 0; i < keys.length; i++) {
      var st = chat.steps[keys[i]]
      if (!st || !st.body) continue
      var text = liveText(st)
      var hasReason = !!st.reasonEl
      syncStepChrome(st, text, hasReason)
      if (!text) continue
      var html = renderMd(text)
      if (html) st.body.innerHTML = html
      st.node.classList.remove('live')
    }
  }

  function fullRenderChat() {
    chat.box.textContent = ''
    chat.steps = Object.create(null)
    chat.cards = Object.create(null)
    chat.maxSeq = chat.cursor || 0
    if (chat.hasMore) {
      var older = el('button', 'older', T.loadOlder)
      older.addEventListener('click', loadOlder)
      chat.box.appendChild(older)
      chat.olderBtn = older
    }
    for (var i = 0; i < chat.events.length; i++) {
      var ev = chat.events[i] && chat.events[i].event
      if (ev && typeof ev.seq === 'number' && ev.seq > chat.maxSeq) chat.maxSeq = ev.seq
      foldEvent(chat.events[i])
    }
    renderHistoricalSteps()
    scrollBottom(chat.box)
  }

  function openChat(id) {
    var app = document.getElementById('app')
    app.textContent = ''
    var s = state.byId[id]
    var title = state.titles[id] || (s ? sessionTitle(s) : T.untitled)
    app.appendChild(renderHead(title, { back: true, menu: true }))
    app.appendChild(el('div', 'loading', T.loading))

    chat = {
      id: id, box: null, events: [], hasMore: false, baseSeq: null, cursor: 0,
      maxSeq: 0, steps: Object.create(null), cards: Object.create(null), olderBtn: null,
      projections: null, running: !!(s && s.running),
      app: app, s: s,
    }
    // rc.1: 历史+实时同源——session/follow 流首帧快照即尾部窗口，之后逐事件推送
    openFollow(id)
  }

  // follow 快照到达（首开或重连重基线）：整树重建聊天 DOM
  function onChatSnapshot() {
    var app = chat.app
    var id = chat.id
    var s = chat.s
    // cursor 是日志切点（含被打包包走的 chunk 事件），maxSeq 从切点起算防重
    if (typeof chat.cursor === 'number' && chat.cursor > chat.maxSeq) chat.maxSeq = chat.cursor
    app.textContent = ''
    app.appendChild(renderHead(state.titles[id] || (s ? sessionTitle(s) : T.untitled), { back: true, menu: true }))
    chat.box = el('div', 'chat')
    app.appendChild(chat.box)
    fullRenderChat()
    // System events (preset/policy/inbox) fold to nothing visible — judge
    // emptiness by rendered messages, not the raw event count.
    if (!chat.box.querySelector('.msg')) {
      var enote = el('div', 'chatnote empty-note', T.chatEmpty)
      chat.box.appendChild(enote)
    }
    buildComposer(app, id)
    paintModelSeat()
  }

  function onFollowError(err) {
    console.error('[follow]', err)
    if (!chat || state.view !== 'chat') return
    var app = chat.app
    app.textContent = ''
    app.appendChild(renderHead(state.titles[chat.id] || T.untitled, { back: true, menu: true }))
    app.appendChild(el('div', 'err', T.historyFail))
  }

  function loadOlder() {
    if (!chat || chat.baseSeq == null || chat.loadingOlder || !chat.cursor) return
    chat.loadingOlder = true
    if (chat.olderBtn) chat.olderBtn.textContent = T.loading
    rpc('session.page', {
      address: { kind: 'session', sessionId: chat.id },
      throughSeq: chat.cursor,
      beforeSeq: chat.baseSeq,
      maxMessages: 20,
    }).then(function (v) {
      if (!chat) return
      var older = (v && v.records) || []
      if (older.length) {
        var oldH = chat.box.scrollHeight
        var oldTop = chat.box.scrollTop
        chat.events = older.concat(chat.events)
        var first = older[0] && older[0].event
        chat.baseSeq = first && typeof first.seq === 'number' ? first.seq : chat.baseSeq
        chat.hasMore = !!(v && v.hasMore)
        fullRenderChat()
        chat.box.scrollTop = chat.box.scrollHeight - oldH + oldTop
      } else {
        chat.hasMore = false
        if (chat.olderBtn) chat.olderBtn.remove()
      }
    }).catch(function (e) { console.error('[older]', e) })
      .then(function () { if (chat) chat.loadingOlder = false })
  }

  // Live frames for the open chat: seq-dedup stitch.
  onMux('session/event', function (f) {
    if (!chat || state.view !== 'chat' || f.sessionId !== chat.id) return
    var ev = f.event
    if (!ev || typeof ev.seq !== 'number') return
    if (ev.seq <= chat.maxSeq) return
    chat.maxSeq = ev.seq
    foldEvent(f)
  })

  // ═══════════════ phase 3: composer / sheets / answers ════════════════

  // ── toast ───────────────────────────────────────────────────
  var toastTimer = null
  function toast(text) {
    var t = document.querySelector('.mtoast')
    if (!t) {
      t = el('div', 'mtoast')
      document.body.appendChild(t)
    }
    t.textContent = text
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { t.classList.remove('show') }, 2500)
  }

  // ── generic bottom sheet ────────────────────────────────────
  var sheetEl = null
  var sheetOpenedAt = 0
  function closeSheet() {
    if (sheetEl) { sheetEl.remove(); sheetEl = null }
  }
  function openSheet(build) {
    closeSheet()
    var mask = el('div', 'mask')
    var sheet = el('div', 'sheet')
    sheetOpenedAt = Date.now()
    mask.addEventListener('click', function (ev) {
      // The synthesized click trailing a long-press lands on the mask at the
      // press point — swallow it or the sheet would close on finger lift.
      if (Date.now() - sheetOpenedAt < 500) return
      if (ev.target === mask) closeSheet()
    })
    mask.appendChild(sheet)
    document.body.appendChild(mask)
    sheetEl = mask
    build(sheet)
    return sheet
  }

  // ── composer ────────────────────────────────────────────────
  // chat.composer fields live on the chat object: input, sendBtn, queueChip,
  // modelBtn, queueCount, running.
  function paintComposer() {
    if (!chat || !chat.sendBtn) return
    var hasText = chat.input && chat.input.value.trim().length > 0
    var hasAttach = !!(chat.id && attachList(chat.id).length)
    if (chat.running) {
      chat.sendBtn.textContent = '■'
      chat.sendBtn.setAttribute('aria-label', T.stop)
      chat.sendBtn.disabled = false
      chat.sendBtn.classList.add('stopping')
    } else {
      chat.sendBtn.textContent = '↑'
      chat.sendBtn.setAttribute('aria-label', T.send)
      chat.sendBtn.disabled = !hasText && !hasAttach
      chat.sendBtn.classList.remove('stopping')
    }
    if (chat.queueChip) {
      chat.queueChip.hidden = !chat.queueCount
      if (chat.queueCount) chat.queueChip.textContent = chat.queueCount + T.queued
    }
  }

  function buildComposer(app, sessionId) {
    var wrap = el('div', 'composer')
    var chip = el('div', 'queue-chip')
    chip.hidden = true
    wrap.appendChild(chip)

    var attachRow = el('div', 'c-attach-row')
    attachRow.hidden = true
    wrap.appendChild(attachRow)

    var row = el('div', 'c-row')
    var attachBtn = el('button', 'c-attach', '📎')
    attachBtn.setAttribute('aria-label', T.attach)
    attachBtn.addEventListener('click', function () { openAttachSheet(sessionId) })

    var input = el('textarea', 'c-input')
    input.rows = 1
    input.placeholder = T.placeholder
    input.addEventListener('input', function () {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 120) + 'px'
      paintComposer()
    })

    var sendBtn = el('button', 'c-send', '↑')
    sendBtn.disabled = true
    sendBtn.addEventListener('click', function () {
      if (chat && chat.running) {
        rpc('session.cancel', { sessionId: sessionId }).catch(function (e) {
          console.error('[cancel]', e)
        })
        return
      }
      var text = input.value.trim()
      var atts = attachList(sessionId)
      if (!text && !atts.length) return
      input.value = ''
      input.style.height = 'auto'
      var tz
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch (e) {}
      var content = []
      if (text) content.push({ type: 'text', text: text })
      for (var ai = 0; ai < atts.length; ai++) content.push({ type: 'file', receiptId: atts[ai].receiptId })
      rpc('session.prompt', {
        requestId: rpcId(),   // 客户端铸造的消息 id（服务端落在同名 user 消息上）
        sessionId: sessionId,
        mode: 'queue',
        content: content,
        clientTimeZone: tz,
      }).then(function () {
        state.attachments[sessionId] = []
        paintAttachChips(sessionId)
      }).catch(function (e) {
        console.error('[prompt]', e)
        toast(T.sendFail)
      })
      paintComposer()
    })

    row.appendChild(attachBtn)
    row.appendChild(input)
    row.appendChild(sendBtn)
    wrap.appendChild(row)

    var meta = el('div', 'c-meta')
    var modelBtn = el('button', 'c-model', '…')
    modelBtn.addEventListener('click', function () { openModelSheet(sessionId) })
    meta.appendChild(modelBtn)
    wrap.appendChild(meta)

    app.appendChild(wrap)
    chat.input = input
    chat.sendBtn = sendBtn
    chat.attachRow = attachRow
    chat.queueChip = chip
    chat.modelBtn = modelBtn
    chat.queueCount = 0
    paintComposer()
    paintAttachChips(sessionId)

    // Model label for the chip: rc.1 起目录（session/modelCatalog）与当前
    // 模型（follow 快照 projections.modelSelection）分家，两者凑齐再落字。
    state.modelCatalog = null
    rpc('session.models', {}).then(function (v) {
      state.modelCatalog = v
      paintModelSeat()
    }).catch(function () {})
  }

  // 当前模型 = follow 快照投影 modelSelection 的 next||lastUsed
  function currentModelSel() {
    var ms = chat && chat.projections && chat.projections.modelSelection
    var sel = ms && (ms.next || ms.lastUsed)
    return sel && sel.model ? sel : null
  }
  function paintModelSeat() {
    if (!chat || !chat.modelBtn) return
    var cur = currentModelSel()
    if (!cur) { chat.modelBtn.textContent = '…'; return }
    var seat = modelSeatLabel(cur, (state.modelCatalog && state.modelCatalog.groups) || [])
    chat.modelBtn.textContent = seat || cur.model
  }

  // ── attach sheet: chat attachment OR workspace download ──────
  // 0.2.2 官方接口：fileUploads/upload 把文件作为聊天附件暂存，receiptId 随
  // 下一条 prompt 的 content file-part 发送；workspaceFiles/list|readBytes
  // 读取工作区文件（scope = 当前会话 id，path 相对工作区根，'' 为根）。
  var MAX_ATTACH_BYTES = 8 * 1024 * 1024

  function attachList(sessionId) {
    var m = state.attachments || (state.attachments = Object.create(null))
    if (!m[sessionId]) m[sessionId] = []
    return m[sessionId]
  }

  function paintAttachChips(sessionId) {
    if (!chat || chat.id !== sessionId || !chat.attachRow) return
    var list = attachList(sessionId)
    var row = chat.attachRow
    row.textContent = ''
    row.hidden = list.length === 0
    for (var i = 0; i < list.length; i++) {
      (function (item, idx) {
        var chip = el('span', 'c-chip')
        chip.appendChild(el('span', 'c-chip-name', esc(item.name || 'attachment')))
        var x = el('button', 'c-chip-x', '×')
        x.setAttribute('aria-label', T.detach)
        x.addEventListener('click', function () {
          list.splice(idx, 1)
          paintAttachChips(sessionId)
          paintComposer()
        })
        chip.appendChild(x)
        row.appendChild(chip)
      })(list[i], i)
    }
  }

  function openAttachSheet(sessionId) {
    openSheet(function (sheet) {
      var up = el('button', 'sheet-item', '⇪ ' + T.upload)
      up.addEventListener('click', function () { closeSheet(); pickAndUpload(sessionId) })
      var down = el('button', 'sheet-item', '⇩ ' + T.download)
      down.addEventListener('click', function () { closeSheet(); openDownloadSheet(sessionId) })
      sheet.appendChild(up)
      sheet.appendChild(down)
      sheet.appendChild(el('div', 'sheet-note', T.attachHint))
    })
  }

  function pickAndUpload(sessionId) {
    var inp = document.createElement('input')
    inp.type = 'file'
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]
      if (!f) return
      if (f.size > MAX_ATTACH_BYTES) { toast(T.fileTooBig); return }
      toast(T.uploading)
      var fr = new FileReader()
      fr.onload = function () {
        var b64 = String(fr.result || '').split(',')[1] || ''
        rpc('fileUploads/upload', { agentId: sessionId, request: { data: b64, name: f.name } })
          .then(function (v) {
            if (!v || !v.receiptId) { toast(T.uploadFail); return }
            attachList(sessionId).push({ receiptId: v.receiptId, name: f.name })
            paintAttachChips(sessionId)
            paintComposer()
            toast(T.uploaded + f.name)
          })
          .catch(function (e) { console.error('[upload]', e); toast(T.uploadFail) })
      }
      fr.onerror = function () { toast(T.uploadFail) }
      fr.readAsDataURL(f)
    })
    inp.click()
  }

  function openDownloadSheet(sessionId) {
    rpc('workspaceFiles/list', { workspaceFileScopeId: sessionId, path: '.' })
      .then(function (v) {
        var entries = (v && v.entries) || []
        var files = entries.filter(function (e) { return e && e.type === 'file' })
        openSheet(function (sheet) {
          if (!files.length) { sheet.appendChild(el('div', 'sheet-empty', T.noFiles)); return }
          for (var i = 0; i < files.length; i++) {
            (function (f) {
              var it = el('button', 'sheet-item', esc(f.name))
              it.addEventListener('click', function () {
                closeSheet()
                downloadFile(sessionId, f.name)
              })
              sheet.appendChild(it)
            })(files[i])
          }
        })
      })
      .catch(function (e) { console.error('[wslist]', e); toast(T.downloadFail) })
  }

  function downloadFile(sessionId, name) {
    // readBytes 走 multipart/form-data：metadata 是 JSON 信封，字节在独立 part 里
    // （envelope.attachments[0].part），不是普通 JSON 响应。
    fetch('/api/workspaceFiles/readBytes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: rpcId(), method: 'workspaceFiles/readBytes',
        payload: { args: { workspaceFileScopeId: sessionId, path: name, options: {} } },
      }),
    })
      .then(function (r) {
        if (r.status === 401) { gotoLogin(); throw new Error('unauthorized') }
        if (!r.ok) throw new Error('HTTP ' + r.status)
        var ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        if (ct !== 'multipart/form-data') {
          return r.json().then(function (full) {
            var res = full && full.result
            if (!res || !res.ok) throw new Error((res && res.error && res.error.message) || 'rpc error')
            var v = res.value
            if (!v || typeof v.data !== 'string') throw new Error('unsupported response')
            var bin = atob(v.data)
            var arr = new Uint8Array(bin.length)
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
            return arr
          })
        }
        return r.formData().then(function (body) {
          var fields = new Map()
          body.forEach(function (value, key) { fields.set(key, value) })
          var meta = JSON.parse(fields.get('metadata'))
          var res = meta && meta.result
          if (!res || !res.ok) throw new Error((res && res.error && res.error.message) || 'rpc error')
          var att = (meta.attachments || [])[0]
          var blob = att && fields.get(att.part)
          if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('missing attachment part')
          return blob.arrayBuffer().then(function (buf) { return new Uint8Array(buf) })
        })
      })
      .then(function (bytes) {
        var blob = new Blob([bytes], { type: 'application/octet-stream' })
        var u = URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = u
        a.download = name
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(function () { URL.revokeObjectURL(u) }, 1500)
      })
      .catch(function (e) { console.error('[download]', e); toast(T.downloadFail) })
  }

  // ── model sheet ─────────────────────────────────────────────
  // Composer model-seat label: "model · effort". rc.1: cur 来自投影
  // （{provider,model,reasoningEffort?}），目录 groups 只用来解析 effort 显示名。
  function modelSeatLabel(cur, groups) {
    if (!cur || !cur.model) return null
    var label = cur.model
    var reasoning = null
    for (var gi = 0; gi < groups.length && !reasoning; gi++) {
      var g = groups[gi]
      if (g.id !== cur.provider) continue
      for (var mi = 0; mi < g.models.length; mi++) {
        var m = g.models[mi]
        if ((m.model || m.id) === cur.model && m.reasoning) { reasoning = m.reasoning; break }
      }
    }
    if (reasoning) {
      var eff = cur.reasoningEffort !== undefined
        ? cur.reasoningEffort
        : reasoning.defaultEffort
      if (eff !== undefined) {
        var nm = null
        for (var ei = 0; ei < reasoning.efforts.length; ei++) {
          if (reasoning.efforts[ei].id === eff) { nm = reasoning.efforts[ei].name; break }
        }
        label = label + ' · ' + (nm || eff)
      }
    }
    return label
  }

  function openModelSheet(sessionId) {
    openSheet(function (sheet) {
      sheet.appendChild(el('div', 'sheet-empty', T.modelLoading))
      rpc('session.models', {}).then(function (v) {
        if (!sheetEl) return // sheet closed meanwhile
        state.modelCatalog = v || state.modelCatalog
        sheet.textContent = ''
        var groups = (v && v.groups) || []
        var cur = currentModelSel()
        var any = false
        var curReasoning = null
        for (var gi = 0; gi < groups.length; gi++) {
          var models = groups[gi].models || []
          for (var mi = 0; mi < models.length; mi++) {
            (function (g, m) {
              any = true
              var label = m.name || m.model || m.id
              var active = cur && cur.provider === g.id && cur.model === (m.model || m.id)
              if (active && m.reasoning) curReasoning = m.reasoning
              var it = el('button', 'sheet-item' + (active ? ' active' : ''), esc(label))
              it.addEventListener('click', function () {
                if (active) { closeSheet(); return } // same model: nothing to change
                closeSheet()
                // Model switch without effort: the host resolves the adapter
                // default (official ModelSelect does the same).
                rpc('session.selectModel', {
                  sessionId: sessionId,
                  provider: g.id,
                  model: m.model || m.id,
                }).then(function (r) {
                  if (r && r.selected && chat) {
                    chat.projections = chat.projections || {}
                    chat.projections.modelSelection = { next: r.selected, lastUsed: (chat.projections.modelSelection || {}).lastUsed || null }
                    paintModelSeat()
                  }
                }).catch(function (e) { console.error('[selectModel]', e) })
              })
              sheet.appendChild(it)
            })(groups[gi], models[mi])
          }
        }
        if (!any) {
          sheet.appendChild(el('div', 'sheet-empty', T.modelFail))
          return
        }
        // Reasoning effort section — only for the CURRENT model route
        // (official ModelSelect: effort belongs to the exact model). A
        // "Default" choice appears only when the adapter has no default.
        if (cur && curReasoning) {
          sheet.appendChild(el('div', 'sheet-sec', esc(T.effort)))
          var effRow = el('div', 'effort-row')
          var effOpts = []
          if (curReasoning.defaultEffort === undefined) {
            effOpts.push({ key: 'default', effort: undefined, label: T.effortDefault })
          }
          for (var ei = 0; ei < curReasoning.efforts.length; ei++) {
            effOpts.push({ key: curReasoning.efforts[ei].id, effort: curReasoning.efforts[ei].id, label: curReasoning.efforts[ei].name })
          }
          var effNow = cur.reasoningEffort !== undefined
            ? cur.reasoningEffort
            : curReasoning.defaultEffort
          for (var oi = 0; oi < effOpts.length; oi++) {
            (function (opt) {
              var on = opt.effort === effNow
              var chip = el('button', 'effort-chip' + (on ? ' on' : ''), esc(opt.label))
              chip.addEventListener('click', function () {
                if (on) { closeSheet(); return } // already effective
                closeSheet()
                var payload = { sessionId: sessionId, provider: cur.provider, model: cur.model }
                if (opt.effort !== undefined) payload.reasoningEffort = opt.effort
                rpc('session.selectModel', payload).then(function (r) {
                  if (r && r.selected && chat) {
                    chat.projections = chat.projections || {}
                    chat.projections.modelSelection = { next: r.selected, lastUsed: (chat.projections.modelSelection || {}).lastUsed || null }
                    paintModelSeat()
                  }
                }).catch(function (e) {
                  console.error('[selectModel effort]', e)
                  toast(T.modelFail)
                })
              })
              effRow.appendChild(chip)
            })(effOpts[oi])
          }
          sheet.appendChild(effRow)
        }
      }).catch(function () {
        if (!sheetEl) return
        sheet.textContent = ''
        sheet.appendChild(el('div', 'sheet-empty', T.modelFail))
      })
    })
  }

  // ── approvals / questions（rc.1：$events waterfall）──────────
  // waterfall 帧经 dispatchBus 带 meta {clientId, eventId, agentId}；应答 =
  // POST /api/$events/result {args:{clientId,eventId,outcome:{kind:'result',value}}}。
  // 服务端取消（他端已答/超时）→ 'waterfall/cancel' 总线 → 关弹层。
  function answerWaterfall(meta, value) {
    return rpc('$events/result', {
      clientId: meta.clientId,
      eventId: meta.eventId,
      outcome: { kind: 'result', value: value },
    }).catch(function (e) { console.error('[answer]', e) })
  }

  var answerEl = null // current approval/question modal
  function closeAnswer() {
    if (answerEl) { answerEl.remove(); answerEl = null }
  }

  onMux('approval/request', function (req, meta) {
    if (!chat || !meta || meta.agentId !== chat.id) return
    req = req || {}
    closeAnswer()
    var mask = el('div', 'mask')
    var sheet = el('div', 'sheet')
    sheet.appendChild(el('div', 'sheet-title', T.approvalTitle))
    sheet.appendChild(el('div', 'sheet-body', esc(req.toolName) + (req.reason ? '\n' + esc(req.reason) : '')))
    var acts = el('div', 'sheet-actions')
    var deny = el('button', 'btn-ghost', T.deny)
    deny.addEventListener('click', function () {
      closeAnswer()
      answerWaterfall(meta, 'rejected')
    })
    var allow = el('button', 'btn-primary', T.allow)
    allow.addEventListener('click', function () {
      closeAnswer()
      answerWaterfall(meta, 'allowed-once')
    })
    acts.appendChild(deny); acts.appendChild(allow)
    sheet.appendChild(acts)
    mask.appendChild(sheet)
    document.body.appendChild(mask)
    answerEl = mask
  })

  onMux('user-questions/request', function (req, meta) {
    if (!chat || !meta || meta.agentId !== chat.id) return
    closeAnswer()
    var qs = (req && req.questions) || []
    var picks = {} // question id -> { selected: [], custom: '' }
    var mask = el('div', 'mask')
    var sheet = el('div', 'sheet')
    for (var qi = 0; qi < qs.length; qi++) {
      (function (q) {
        picks[q.id] = { selected: [], custom: '' }
        var block = el('div', 'q-block')
        if (q.header) block.appendChild(el('div', 'q-head', esc(q.header)))
        block.appendChild(el('div', 'q-text', esc(q.question)))
        if (q.detail) block.appendChild(el('div', 'q-detail', esc(q.detail)))
        var opts = q.options || []
        if (opts.length) {
          var optBox = el('div', 'q-opts')
          for (var oi = 0; oi < opts.length; oi++) {
            (function (opt) {
              var chip = el('button', 'q-opt', esc(opt.label))
              chip.addEventListener('click', function () {
                var sel = picks[q.id].selected
                var at = sel.indexOf(opt.label)
                if (q.multiSelect) {
                  if (at >= 0) sel.splice(at, 1); else sel.push(opt.label)
                } else {
                  sel.length = 0
                  if (at < 0) sel.push(opt.label)
                }
                var chips = optBox.children
                for (var ci = 0; ci < chips.length; ci++) {
                  chips[ci].classList.toggle('on', sel.indexOf(opts[ci].label) >= 0)
                }
              })
              optBox.appendChild(chip)
            })(opts[oi])
          }
          block.appendChild(optBox)
        }
        var custom = el('input', 'q-custom')
        custom.placeholder = T.customHint
        custom.addEventListener('input', function () { picks[q.id].custom = custom.value })
        block.appendChild(custom)
        sheet.appendChild(block)
      })(qs[qi])
    }
    var acts = el('div', 'sheet-actions')
    var later = el('button', 'btn-ghost', T.answerLater)
    later.addEventListener('click', closeAnswer) // stays pending; replays on reconnect
    var ok = el('button', 'btn-primary', T.answerSend)
    ok.addEventListener('click', function () {
      var answers = []
      for (var qi2 = 0; qi2 < qs.length; qi2++) {
        var q2 = qs[qi2]
        var p = picks[q2.id]
        var item = { id: q2.id, selected: p.selected }
        if (p.custom && p.custom.trim()) item.custom = p.custom.trim()
        answers.push(item)
      }
      closeAnswer()
      answerWaterfall(meta, { answers: answers })
    })
    acts.appendChild(later); acts.appendChild(ok)
    sheet.appendChild(acts)
    mask.appendChild(sheet)
    document.body.appendChild(mask)
    answerEl = mask
  })

  onMux('waterfall/cancel', function () { closeAnswer() })

  // 注意：rc.1 队列深度暂无流式来源（旧 session/queue 事件退役）——
  // queue chip 保持隐藏，不显示错误数字（已知降级，见技能参考）

  // ── mux-driven list refresh ─────────────────────────────────
  // rc.1：列表活性事件 = $events 总线的 api-session/*（added/removed/
  // activity/status/error）。标题等投影变化随刷新重拉自然生效。
  var refreshTimer = null
  function scheduleRefresh() {
    if (state.view !== 'list') return
    if (refreshTimer) return
    refreshTimer = setTimeout(function () { refreshTimer = null; loadList() }, 600)
  }
  onMux('api-session/added', function (args) {
    var s = args && args[0]
    if (s && s.sessionId) {
      var t = s.projections && s.projections.values && s.projections.values.title
      if (typeof t === 'string' && t) state.titles[s.sessionId] = t
    }
    scheduleRefresh()
  })
  onMux('api-session/removed', scheduleRefresh)
  onMux('api-session/activity', scheduleRefresh)
  onMux('api-session/status', scheduleRefresh)

  // ── routing ─────────────────────────────────────────────────
  function route() {
    var h = location.hash || '#/'
    var m = h.match(/^#\/s\/(.+)$/)
    if (m) {
      state.view = 'chat'
      chat = null
      openChat(decodeURIComponent(m[1]))
    } else {
      state.view = 'list'
      chat = null
      closeFollow()
      loadList()
    }
  }
  window.addEventListener('hashchange', route)

  // ── debug hook for probes: inject a synthetic mux frame ─────
  // Used by the Playwright probes to exercise approval/question modals
  // (real gated tools are not guaranteed to ask in every deployment).
  window.__dshwm = {
    dispatch: function (type, frame, rpcIdValue) {
      var hs = muxHandlers[type] || []
      for (var i = 0; i < hs.length; i++) hs[i](frame, rpcIdValue || 'debug-rpc')
    },
  }

  // ── boot ────────────────────────────────────────────────────
  // Soft-keyboard fit: keep #app pinned to the VISUAL viewport height so the
  // composer rides above the keyboard (Chrome also honors the meta's
  // interactive-widget; this covers engines that don't).
  function fitViewport() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight
    var app = document.getElementById('app')
    if (app) app.style.height = Math.round(h) + 'px'
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport)
  }
  window.addEventListener('resize', fitViewport)
  fitViewport()

  connectMux()
  route()
})()
