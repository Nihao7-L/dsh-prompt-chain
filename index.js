/**
 * Prompt Enhance — plugin entry (Host half).
 *
 * Owns three things:
 *   1. the settings store (plain JSON in `<dsh home>/prompt-chain/config.json`),
 *      merged from the entry config plus whatever the settings page writes;
 *   2. one JSON API under `/api/prompt-chain` the browser half reads and
 *      writes through (`GET /settings`, `PUT /settings`, `GET /providers`,
 *      `POST /enhance`);
 *   3. the model call itself: `POST /enhance` streams the draft through
 *      `ctx.llm.stream` — either the session's current route (from the
 *      session's logged `request/context` / `request/header` events) or the
 *      provider/model pair configured on the settings page.
 *
 * Every harness facility is reached through `ctx`; only `llm` is declared in
 * `inject`, so a composition without the web server still lets the plugin load
 * (the routes simply never mount). See the inject note below.
 *
 * @module index.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SETTINGS, continueSystemPrompt, continueUserText, enhanceSystemPrompt, enhanceUserText, normalizeSettings } from './src/config.js'

export const name = 'prompt-chain'

/** The installed package directory. */
const PKG_DIR = fileURLToPath(new URL('./', import.meta.url))

export const inject = ['llm']

const PLUGIN_VERSION = readPackageVersion()

/**
 * m21352：`GET /meta` 要展示「现在发出去的最终系统提示词」，而语言规则在
 * `auto` 模式下依赖草稿本身。用一段中文样例去组装，「查看最终提示词」里看到
 * 的就是中文输入时真正发送的内容（以前没有样例，auto 会退化成英文分支）。
 */
const DEFAULT_SYSTEM_PROMPT_SAMPLE = '把这个需求改写成一条可以直接执行的提示词'

function readPackageVersion() {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')).version ?? '')
  } catch {
    return ''
  }
}

// ── harness LLM helpers, resolved on demand ──────────────────────────────────
// These come from the harness installation rather than from this package, so a
// top-level `import '@deepseek-ai/dsh-llm'` is resolved by whatever resolver the
// host installed for the entries it composed. When this plugin is mounted from
// a profile that does not list it as a dependency, that resolver may not cover
// it and the import fails — and a failed import takes the *whole* web boot
// down, not just this plugin. Resolve lazily and fall back to local
// equivalents so the harness always starts; a missing helper then only costs
// fidelity on the enhance call itself.
let helperCache

/** @returns {Promise<{BlockAssembler: Function|null, createUserMessage: Function|null}>} */
async function loadLlmHelpers(warn) {
  if (helperCache !== undefined) return helperCache
  try {
    const mod = await import('@deepseek-ai/dsh-llm')
    helperCache = {
      BlockAssembler: typeof mod.BlockAssembler === 'function' ? mod.BlockAssembler : null,
      createUserMessage: typeof mod.createUserMessage === 'function' ? mod.createUserMessage : null,
    }
    if (helperCache.BlockAssembler === null || helperCache.createUserMessage === null) {
      warn('prompt-chain: @deepseek-ai/dsh-llm is missing an expected export; using local fallbacks')
    }
  } catch (error) {
    warn(`prompt-chain: @deepseek-ai/dsh-llm unavailable (${error?.message ?? error}); using local fallbacks`)
    helperCache = { BlockAssembler: null, createUserMessage: null }
  }
  return helperCache
}

/**
 * Local stand-in for `BlockAssembler`, exposing the same three things the
 * caller reads: `push(chunk)`, `blocks()` and `finish`. It accepts every chunk
 * shape the runtime may emit (a bare text block, a `{blocks:[...]}` envelope, a
 * `{block}` wrapper, or a raw `{delta}` string) so a shape change cannot make
 * the rewrite silently return nothing.
 */
function createLocalAssembler() {
  const parts = []
  let finish
  const collect = (chunk) => {
    if (chunk === null || typeof chunk !== 'object') return
    if (chunk.finish !== undefined) finish = chunk.finish
    if (Array.isArray(chunk.blocks)) {
      for (const block of chunk.blocks) collect(block)
      return
    }
    if (chunk.block !== undefined) {
      collect(chunk.block)
      return
    }
    if (typeof chunk.text === 'string' && (chunk.type === undefined || chunk.type === 'text')) parts.push(chunk.text)
    else if (typeof chunk.delta === 'string') parts.push(chunk.delta)
  }
  return {
    push: collect,
    blocks: () => (parts.length > 0 ? [{ type: 'text', text: parts.join('') }] : []),
    get finish() { return finish },
  }
}

/** Local stand-in for `createUserMessage` producing the same message shape. */
function localUserMessage(framedText) {
  return {
    role: 'user',
    content: [{ type: 'text', text: framedText }],
    source: { kind: 'prompt-chain' },
  }
}



/** Read the dsh home directory without assuming a specific deployment. */
function resolveDshHome(ctx) {
  if (process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== '') return process.env.DSH_HOME
  const profile = typeof ctx.get === 'function' ? ctx.get('profileContext') : undefined
  const dir = profile?.dir ?? profile?.baseDir
  if (typeof dir === 'string' && dir !== '') {
    // <profile>/../.. is the dsh home: the shipped desktop layout is
    // <dsh home>/profiles/<name>, so the home is two levels above the profile.
    return path.resolve(dir, '..', '..')
  }
  return path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.dsh')
}

export function apply(ctx) {
  const logger = {
    info: (...args) => ctx.logger?.info?.(...args),
    warn: (...args) => ctx.logger?.warn?.(...args),
  }

  // ── settings ───────────────────────────────────────────────────────────────
  // One JSON file. The entry config seeds the defaults (so users can pre-set a
  // model in cordos.patch.yml), the settings page writes win at runtime, and
  // every write is atomic (tmp + rename) so a crash never truncates the file.
  const dataDir = path.join(resolveDshHome(ctx), 'prompt-chain')
  const configFile = path.join(dataDir, 'config.json')
  const hostLogFile = path.join(dataDir, 'host-diag.ndjson')
  const clientLogFile = path.join(dataDir, 'client-diag.ndjson')
  const DIAG_MAX_BYTES = 256 * 1024

  /**
   * Append one ndjson line to a diagnostics file.
   *
   * Best-effort by contract: a full disk, a locked file or a read-only home
   * must never break a request or abort startup. The file is rotated to
   * `<name>.old` once it passes DIAG_MAX_BYTES so a long-running app cannot
   * grow it without bound.
   */
  function appendDiag(file, entry) {
    try {
      fs.mkdirSync(dataDir, { recursive: true })
      try {
        if (fs.statSync(file).size > DIAG_MAX_BYTES) fs.renameSync(file, file + '.old')
      } catch { /* missing or unstattable — just append */ }
      fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
    } catch { /* diagnostics are best-effort */ }
  }

  /**
   * Host-side diagnostic line.
   *
   * This is the half that used to have no logging at all: the renderer posts
   * its own reports to POST /diag, but nothing recorded what the host read
   * from disk or repaired. Every config read/write is now journalled here,
   * which is what makes "按钮又空白" diagnosable without a terminal.
   */
  function hostLog(kind, detail) {
    appendDiag(hostLogFile, Object.assign({ at: new Date().toISOString(), phase: 'host', kind }, detail || {}))
  }

  /** Shorten a value for a log line — never dump a 2 MB data URI into it. */
  function describeValue(value) {
    if (value === null) return 'null'
    if (typeof value === 'string') {
      return value.length > 48
        ? JSON.stringify(value.slice(0, 48)) + ' … (' + value.length + ' chars)'
        : JSON.stringify(value)
    }
    try { return JSON.stringify(value).slice(0, 96) } catch { return '[unserializable]' }
  }

  /**
   * Why `normalizeSettings` changed a value.
   *
   * The host never guesses and never silently keeps a broken value: the reason
   * is attached to the audit entry so the settings page can show the user what
   * was recovered and why.
   */
  function repairReason(key, had, got) {
    if (key === 'provider' || key === 'model') {
      return 'provider 和 model 必须成对设置；只有一半时按"跟随会话"处理'
    }
    if (key === 'triggerIcon') {
      // m05885：图片和表情合并成一个「自定义图标」库之后，triggerIcon 只是旧
      // 配置的迁移来源——它的值会被搬进 triggerEmoji / myEmojis。
      return '旧版「自定义图片」已并入自定义图标库'
    }
    if (typeof had !== typeof got) {
      return '值的类型不对，已重置为默认值'
    }
    if (typeof got === 'number') {
      return '数值超出允许范围，已钳制'
    }
    return '不是可识别的取值，已回落到默认值'
  }

  /**
   * Normalize a raw settings object and audit what changed.
   *
   * Returns `{ settings, repairs }`. Each repair entry is one of:
   *   ok       — survived untouched
   *   missing  — absent from a file that did exist (an old config), default applied
   *   repaired — present but unusable (bad enum, out of range, wrong type)
   *   dropped  — unknown key, ignored
   *
   * `missing` is only reported when a file was actually parsed: with no file
   * at all every key would be "missing" and the audit would be pure noise.
   */
  function sanitize(raw) {
    const fromFile = raw !== null && typeof raw === 'object'
    const src = fromFile ? raw : {}
    const normalized = normalizeSettings(src)
    const repairs = []
    // m05885：triggerIcon 现在总是被搬到 triggerEmoji，所以"它和归一化结果不同"
    // 是正常的迁移，不是需要用户处理的修复——否则每加载一次老配置就报一条
    // repaired，设置页里会常驻一块黄条（用户对常驻提示很敏感）。
    const migratedIcon = typeof src.triggerIcon === 'string' && src.triggerIcon.trim() !== ''
    // m15102: 面板背景老配置「透明 = clear / 不透明 = solid」迁到新五档里的极简白。
    // 这是正常迁移，不是需要用户补救的坏值——否则老配置每次加载都会在设置页
    // 挂一块「不是可识别的取值」的黄条（用户对常驻提示很敏感）。
    const migratedPanelBg = ['clear', 'solid'].includes(src.panelBg)
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!(key in src)) {
        if (fromFile) repairs.push({ key, action: 'missing', to: describeValue(normalized[key]) })
        continue
      }
      const had = src[key]
      // 迁移牵动三个键：triggerIcon 被清空、triggerEmoji 拿到它、myEmojis 多一条。
      // 这三个差异都是这次迁移本身，不是坏值。
      if (migratedIcon && (key === 'triggerIcon' || key === 'triggerEmoji' || key === 'myEmojis')) {
        repairs.push({ key, action: 'ok', value: describeValue(had) })
        continue
      }
      if (migratedPanelBg && key === 'panelBg') {
        repairs.push({ key, action: 'ok', value: describeValue(had) })
        continue
      }
      if (JSON.stringify(had) === JSON.stringify(normalized[key])) {
        repairs.push({ key, action: 'ok', value: describeValue(had) })
        continue
      }
      repairs.push({
        key,
        action: 'repaired',
        from: describeValue(had),
        to: describeValue(normalized[key]),
        reason: repairReason(key, had, normalized[key]),
      })
    }
    for (const key of Object.keys(src)) {
      if (!(key in DEFAULT_SETTINGS)) repairs.push({ key, action: 'dropped', from: describeValue(src[key]) })
    }
    return { settings: normalized, repairs }
  }

  let settings = null
  let repairs = []
  // m24271：配置文件在进程外被改动时（用户手改 config.json、换一个副本、同步工具
  // 覆盖）也要生效。原来只在启动时读一次，之后永远是内存副本——用户改了设置看不
  // 出任何变化，也没法察觉。这里记下读进来时的 mtime+size，每次请求前比对一次。
  let configStamp = ''

  function configSignature() {
    try {
      const st = fs.statSync(configFile)
      return `${st.mtimeMs}:${st.size}`
    } catch {
      return ''
    }
  }

  function loadSettings() {
    let raw = null
    let source = 'defaults'
    const before = configSignature()
    try {
      raw = JSON.parse(fs.readFileSync(configFile, 'utf8'))
      source = 'disk'
    } catch (error) {
      hostLog('settings-read-failed', { file: configFile, reason: String(error?.message ?? error) })
    }
    const result = sanitize(raw)
    settings = result.settings
    repairs = result.repairs
    configStamp = source === 'disk' ? before : ''
    hostLog('settings-loaded', { source, repairs: result.repairs })
    return settings
  }

  /**
   * m24271：配置若在磁盘上变了，就地重新加载。每个请求进来前调用一次。
   * stat 一次很便宜；只有 mtime/size 真的变了才去读文件、跑 sanitize。
   * 读失败时保留内存里的旧配置，不能因为文件被占用就给用户一个空设置。
   */
  function ensureFreshSettings() {
    const now = configSignature()
    if (now === '' || now === configStamp) return settings
    const keep = settings
    try {
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'))
      const result = sanitize(raw)
      settings = result.settings
      repairs = result.repairs
      configStamp = now
      hostLog('settings-reloaded', { source: 'disk', repairs: result.repairs })
    } catch (error) {
      settings = keep
      hostLog('settings-reload-failed', { file: configFile, reason: String(error?.message ?? error) })
    }
    return settings
  }

  function persistSettings(next) {
    const result = sanitize(next)
    settings = result.settings
    repairs = result.repairs
    try {
      fs.mkdirSync(dataDir, { recursive: true })
      const tmp = configFile + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
      fs.renameSync(tmp, configFile)
    } catch (error) {
      logger.warn(`prompt-chain: settings write failed (${error?.message ?? error})`)
      hostLog('settings-write-failed', { file: configFile, reason: String(error?.message ?? error) })
      return false
    }
    hostLog('settings-saved', { repairs: result.repairs })
    return true
  }

  loadSettings()

  // ── model route resolution ─────────────────────────────────────────────────
  // A session's current route lives in its log (`request/context` then
  // `request/header`). The sessions service resolves a session id to the live
  // Session through the agent registry's store; both are opportunistic lookups
  // (ctx.get) because every consumer of /enhance degrades gracefully when the
  // session route is unavailable and the user pinned a fixed model instead.

  /** The agent registry's live store, or undefined when agents hasn't mounted. */
  function agentStore() {
    try {
      const agents = ctx.get('agents')
      return agents?.store ?? agents?.live?.store
    } catch {
      return undefined
    }
  }

  /** Pull a provider/model pair out of one session-like object, or undefined. */
  function routeFromSession(session) {
    if (!session) return undefined
    // Preferred: the live model-selection projection. This is populated as soon
    // as the composer's model seat resolves, so it also works in a brand-new
    // session that has never dispatched a request.
    try {
      const projected = session.projections?.faceOf?.('modelSelection')?.getSnapshot?.()
      const current = projected?.next ?? projected?.lastUsed
      if (current && typeof current.provider === 'string' && current.provider !== '' && typeof current.model === 'string' && current.model !== '') {
        return { provider: current.provider, model: current.model }
      }
    } catch { /* projections are optional; fall through to the log header */ }
    // Fallback: the session log's request header, which only exists once the
    // session has sent at least one request.
    try {
      const config = session.requestHeader?.()?.config
      if (typeof config?.provider === 'string' && config.provider !== '' && typeof config.model === 'string' && config.model !== '') {
        return { provider: config.provider, model: config.model }
      }
    } catch { /* header unavailable */ }
    return undefined
  }

  /** Resolve one session's current provider/model, or undefined. */
  function sessionRoute(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    // Two independent lookups: the sessions service (has projections) and the
    // agent registry's store. Either may be absent depending on which plugins
    // mounted, so probe both and take the first hit.
    try {
      const binding = ctx.get('sessions')?.binding?.(sessionId)
      const route = routeFromSession(binding?.session)
      if (route !== undefined) return route
    } catch (error) {
      logger.warn(`prompt-chain: sessions lookup failed (${error?.message ?? error})`)
    }
    try {
      const agent = agentStore()?.get?.(sessionId)
      const route = routeFromSession(agent?.session)
      if (route !== undefined) return route
    } catch (error) {
      logger.warn(`prompt-chain: agent store lookup failed (${error?.message ?? error})`)
    }
    return undefined
  }

  /** The route the enhance call should use for this request. */
  function resolveRoute({ sessionId, provider, model }) {
    // Explicit body fields (from the settings page's "test" button) win.
    if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== '') {
      return { provider, model, source: 'explicit' }
    }
    // Pinned model from the settings page.
    if (settings.provider !== null && settings.model !== null) {
      return { provider: settings.provider, model: settings.model, source: 'pinned' }
    }
    // Follow the session's current model.
    const route = sessionRoute(sessionId)
    if (route !== undefined) return { ...route, source: 'session' }
    // Explicit null (not undefined) so the JSON API always carries the key.
    return null
  }

  // ── the enhance call ───────────────────────────────────────────────────────

  /**
   * Stream one operation through ctx.llm and return the joined text.
   *
   * `mode` is 'rewrite' (default) or 'continue'. A continuation returns the
   * original draft with the model's output appended, so the caller never has to
   * stitch the two together — and so the diff it renders is only the new part.
   *
   * maxTokens / reasoningEffort stay unset on purpose: LlmRuntime materializes
   * adapter defaults during dispatch and compares the resolved config against
   * the request — an explicit maxTokens can then mismatch and throw
   * INVALID_PREPARED_CALL. We cap output via the model's own default instead
   * and stop reading after `settings.maxTokens` characters as a backstop.
   *
   * m15602：`context` 参数删掉了。客户端从来没有发过它（enhance 的 body 里只有
   * text/sessionId/mode/模型），所以 src/config.js 里那段「参考上文 2000 字」的
   * 分支是死代码，用户也确认不需要参考上文。截断这件事则改为回报出去：
   * `truncated` 为真时客户端会在面板上说明输出被切了。
   */
  async function runEnhance({ text, sessionId, provider, model, mode, lastResult }) {
    const route = resolveRoute({ sessionId, provider, model })
    if (!route) {
      hostLog('enhance-no-route', { sessionId: sessionId ?? null })
      return { ok: false, error: { code: 'NO_ROUTE', message: '没有可用的模型路由：会话尚未发送过请求，且设置里没有固定模型。请先在会话里选好模型，或在设置页固定一个。' } }
    }
    const draft = (text ?? '').trim()
    if (draft === '') return { ok: false, error: { code: 'EMPTY_DRAFT', message: '输入框是空的，没有可增强的内容。' } }

    const continuing = mode === 'continue'
    // m22250 问题1：客户端会带上「上一版结果」，让模型换一条思路、别原地
    // 重复。老客户端不发这个字段（undefined）时这里就是空串，规则自然消失。
    const previous = typeof lastResult === 'string' ? lastResult.trim() : ''
    // m21352：「跟随原文」由草稿自身的文字决定，所以要把它传进系统提示词组装。
    const system = continuing
      ? continueSystemPrompt(settings, draft, previous)
      : enhanceSystemPrompt(settings, draft, previous)
    const framed = continuing ? continueUserText(draft) : enhanceUserText(text)
    const helpers = await loadLlmHelpers(logger.warn)
    const messages = [helpers.createUserMessage
      ? helpers.createUserMessage({
        content: [{ type: 'text', text: framed }],
        source: { kind: 'prompt-chain' },
      })
      : localUserMessage(framed)]

    const assembler = helpers.BlockAssembler ? new helpers.BlockAssembler() : createLocalAssembler()
    // m07183 / m07744：这个 for await 必须有一个**能真正打断它**的看门狗。
    // 旧实现只把 stalled 置成 true、等 for await 自己结束后才检查——但上游
    // 一旦既不吐 chunk 也不结束，for await 永远走不到结尾，stalled 永远没机会
    // 被读取，于是前端一直转圈（用户 m07741 复现）。这里改成用 Promise.race
    // 把「消费流」和「看门狗」赛跑：看门狗先 reject，就立刻把这次请求判失败
    // 返回，不再傻等。判定仍按「多久没收到新 chunk」而不是总时长，慢模型不误杀。
    // m07875：阈值由用户拍板定为 60 秒（不是我替他定的 30 秒）。含义：只要模型
    // 还在持续吐字就一直等下去，绝不打断；只有「连续 N 秒一个字都没收到」才判
    // 卡死、切断并提示。慢模型哪怕 1 分钟才生成完，只要在出字就不受影响。
    // m08893：用户把阈值再放到 120 秒 —— 实测 magpie/workbuddy·hy3 这类路由组
    // 首包经常 20~40 秒，60 秒对它们偏紧（真卡死和多等一会儿的代价，用户选后者）。
    const STALL_MS = 120000
    const startedAt = Date.now()
    let lastChunkAt = startedAt
    let consumeDone = false
    const consume = (async () => {
      try {
        for await (const chunk of ctx.llm.stream({
          provider: route.provider,
          model: route.model,
          messages,
          system,
          sessionId: typeof sessionId === 'string' && sessionId !== '' ? sessionId : undefined,
        })) {
          lastChunkAt = Date.now()
          assembler.push(chunk)
        }
      } finally {
        consumeDone = true
      }
    })()
    // 流最终自己结束（正常或报错）后，丢弃后台挂着的 consume，避免未处理拒绝。
    consume.catch(() => {})
    const stallError = new Promise((_, reject) => {
      const iv = setInterval(() => {
        if (consumeDone) { clearInterval(iv); return }
        const silent = Date.now() - lastChunkAt
        if (silent > STALL_MS) {
          clearInterval(iv)
          reject(Object.assign(new Error('STALLED'), { silentSeconds: Math.round(silent / 1000) }))
        }
      }, 1000)
    })
    try {
      await Promise.race([consume, stallError])
    } catch (error) {
      if (error && error.message === 'STALLED') {
        hostLog('enhance-failed', { provider: route.provider, model: route.model, code: 'STALLED', ms: Date.now() - startedAt, silentSeconds: error.silentSeconds })
        return { ok: false, error: { code: 'TIMEOUT', message: `模型 ${error.silentSeconds} 秒没有任何返回，已中止。请重试或换一个模型。` } }
      }
      hostLog('enhance-failed', { provider: route.provider, model: route.model, code: 'LLM_FAILED', ms: Date.now() - startedAt, message: String(error?.message ?? error) })
      return { ok: false, error: { code: 'LLM_FAILED', message: String(error?.message ?? error) } }
    }

    const finish = assembler.finish
    if (finish?.kind === 'error' || finish?.kind === 'aborted') {
      hostLog('enhance-failed', { provider: route.provider, model: route.model, code: finish.failure?.code ?? 'LLM_FAILED' })
      return { ok: false, error: { code: finish.failure?.code ?? 'LLM_FAILED', message: finish.failure?.message ?? '模型调用失败。' } }
    }
    const rawOut = assembler.blocks()
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
      // The model is told not to fence the answer; strip a stray fence anyway.
      .replace(/^```[a-z]*\n/, '')
      .replace(/\n```$/, '')
      .trim()
    // m03943：模型偶尔会把**我们拼的用户消息包装**当成要处理的内容抄进正文。
    // 实测（草稿只有「测试」两字那次）返回的是：
    //   Continue this prompt. It stops here:
    //   （空行）
    //   测试
    //   （空行）
    //   请将以上不完整的提示词草稿…
    // 这是间歇性的（同一批 6 条短草稿复跑就全是干净的），靠提示词堵不住。
    // 但包装前缀是插件自己拼的、形状固定，所以在这里**确定性**地剥掉：如果输出
    // 以包装前缀开头，就把它连同其后原样回显的草稿一起切掉，只留模型真正写的部分。
    // m05454：user 消息不再有包装（两种任务都只发草稿原文），没有包装可剥。
    const out = rawOut
    if (out === '') {
      hostLog('enhance-empty-output', { provider: route.provider, model: route.model })
      return { ok: false, error: { code: 'EMPTY_OUTPUT', message: '模型没有返回内容，请重试。' } }
    }
    // 「续写」= 把面板上这一版已经生成过的内容当成输入，再喂给模型，让它在这份
    // 文本的基础上继续补充、完善，返回一份**完整的**新版本。所以模型返回什么就是
    // 什么，直接用（去掉代码围栏、去首尾空白），不做任何拼接、也不做事后去重——
    // 草稿和输出之间没有「接缝」这回事，拼起来才是错的（用户 m03793：
    // 「续写就是继续生成优化，什么叫做拼接。就是把已经生成过一次的内容再丢给模型」）。
    // 重写和续写的数据流完全一样，区别只在提示词。
    // m15602：截断不再是静默的。上限是 maxTokens×4 个字符（见上面的注释），
    // 超出就切掉，并把这件事回报给客户端，由面板写明「输出被截断」。
    const cap = Math.max(1, Number(settings.maxTokens) > 0 ? Number(settings.maxTokens) * 4 : 8192)
    const truncated = out.length > cap
    hostLog('enhance-ok', {
      mode: continuing ? 'continue' : 'rewrite',
      provider: route.provider,
      model: route.model,
      source: route.source,
      chars: out.length,
      truncated,
      ms: Date.now() - startedAt,
    })
    return {
      ok: true,
      value: {
        text: out.slice(0, cap),
        truncated,
        mode: continuing ? 'continue' : 'rewrite',
        route: { provider: route.provider, model: route.model, source: route.source },
      },
    }
  }

  // ── 翻译（m14339 ⑬ → m15304：改成不依赖 LLM 的免费通道）──────────────────
  //
  // 原来走 ctx.llm.stream（会话里选的那条模型路由）。实测那条路经常失败（免费
  // 模型限流／路由没挂上），用户直接要求「不用 LLM、要能持续稳定地翻译」。现在
  // 改成纯 HTTP 通道，按顺序试：
  //   1) MyMemory 免费接口（无需 key、无需登录；单次上限 500 字符 ⇒ 按句分块）
  //   2) LibreTranslate 公共镜像兜底
  // 再加一层进程内缓存：同一段文本只翻一次，反复点「翻译」不再打网络。
  const TRANSLATE_TIMEOUT = 12000
  const MYMEMORY_LIMIT = 460
  const translateCache = new Map()
  const libreMirrors = [
    'https://translate.disroot.org/translate',
    'https://libretranslate.de/translate',
    'https://lt.vern.cc/translate',
  ]
  const decodeEntities = (value) => String(value ?? '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

  // 按句子边界尽量切在标点后，保证每块 <= limit；实在没有标点就硬切。
  function splitForTranslate(text, limit) {
    const out = []
    let rest = String(text ?? '')
    const marks = ['\n\n', '\n', '。', '！', '？', '；', '. ', '! ', '? ', '; ', '，', ', ']
    while (rest.length > limit) {
      let cut = 0
      for (const mark of marks) {
        const at = rest.lastIndexOf(mark, limit)
        if (at > cut) cut = at + mark.length
      }
      if (cut <= 0) cut = limit
      const piece = rest.slice(0, cut).trim()
      if (piece !== '') out.push(piece)
      rest = rest.slice(cut)
    }
    if (rest.trim() !== '') out.push(rest.trim())
    return out
  }

  async function fetchText(url, init, ms) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), ms)
    try {
      const res = await fetch(url, Object.assign({ signal: ac.signal }, init))
      return { status: res.status, body: await res.text() }
    } finally {
      clearTimeout(timer)
    }
  }

  async function translateViaMyMemory(text, want) {
    const pair = want === 'en' ? 'zh-CN|en' : 'en|zh-CN'
    const chunks = splitForTranslate(text, MYMEMORY_LIMIT)
    const done = []
    for (const chunk of chunks) {
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=' + encodeURIComponent(pair)
      const { status, body } = await fetchText(url, { headers: { accept: 'application/json' } }, TRANSLATE_TIMEOUT)
      if (status !== 200) throw new Error('HTTP ' + status)
      const json = JSON.parse(body)
      const got = decodeEntities(json?.responseData?.translatedText).trim()
      const detail = String(json?.responseDetails ?? '')
      if (got === '' || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(detail) || /MYMEMORY WARNING/i.test(got)) {
        throw new Error((detail || got || '空译文').slice(0, 140))
      }
      done.push(got)
    }
    return done.join('\n\n')
  }

  async function translateViaLibre(text, want) {
    let why = '没有可用镜像'
    for (const url of libreMirrors) {
      try {
        const { status, body } = await fetchText(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            q: text,
            source: want === 'en' ? 'zh' : 'en',
            target: want === 'en' ? 'en' : 'zh',
            format: 'text',
          }),
        }, TRANSLATE_TIMEOUT)
        if (status !== 200) { why = 'HTTP ' + status; continue }
        const got = String(JSON.parse(body)?.translatedText ?? '').trim()
        if (got !== '') return got
        why = '空译文'
      } catch (error) {
        why = String(error?.message ?? error)
      }
    }
    throw new Error(why)
  }

  async function runTranslate({ text, to, target }) {
    const source = (text ?? '').trim()
    if (source === '') return { ok: false, error: { code: 'EMPTY_TEXT', message: '没有需要翻译的内容。' } }
    const want = (to ?? target) === 'en' ? 'en' : 'zh'
    const key = want + '\n' + source
    const hit = translateCache.get(key)
    if (hit) {
      hostLog('translate-cache-hit', { to: want, chars: hit.length })
      return { ok: true, value: { text: hit, route: { provider: 'cache', model: 'local', source: 'cache' } } }
    }
    const errors = []
    const channels = [['mymemory', translateViaMyMemory], ['libre', translateViaLibre]]
    for (const [name, run] of channels) {
      try {
        const out = (await run(source, want)).trim().slice(0, 8000)
        if (out === '') { errors.push(name + ': 空译文'); continue }
        if (translateCache.size > 200) translateCache.clear()
        translateCache.set(key, out)
        hostLog('translate-ok', { to: want, channel: name, chars: out.length })
        return { ok: true, value: { text: out, route: { provider: name, model: 'free', source: 'http' } } }
      } catch (error) {
        const why = String(error?.message ?? error).slice(0, 160)
        errors.push(name + ': ' + why)
        hostLog('translate-channel-failed', { channel: name, message: why })
      }
    }
    hostLog('translate-failed', { to: want })
    return { ok: false, error: { code: 'TRANSLATE_FAILED', message: '翻译服务暂时不可用（' + errors.join('；') + '）。' } }
  }

  // ── HTTP API ───────────────────────────────────────────────────────────────

  function readBody(req, limitBytes = 256 * 1024) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', chunk => {
        size += chunk.length
        if (size > limitBytes) {
          reject(new Error('request body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  function json(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  async function api(req, res) {
    const url = new URL(req.url ?? '/', 'http://x')
    const routePath = url.pathname.replace(/^\/api\/prompt-chain/, '') || '/'
    // m24271：配置可能被进程外的编辑器改过，每个请求进来先确认一次。
    ensureFreshSettings()
    try {
      if (req.method === 'GET' && routePath === '/meta') {
        return json(res, 200, {
          version: PLUGIN_VERSION,
          // m13797: the settings page shows/copies the built-in prompt for the
          // *current* style + language. Serving it keeps one source of truth
          // (src/config.js) instead of a second copy in the client that drifts.
          // A custom systemPrompt never leaks in here — this is "什么才是默认".
          prompts: {
            rewrite: enhanceSystemPrompt(settings, DEFAULT_SYSTEM_PROMPT_SAMPLE),
            continue: continueSystemPrompt(settings, DEFAULT_SYSTEM_PROMPT_SAMPLE),
          },
        })
      }
      // Client diagnostics. The renderer half has no disk access, so it posts
      // activation reports here and we append them next to config.json. This is
      // the only way to learn *why* a client entry failed: the desktop crash log
      // records only the fiber state ("dsh-prompt-chain: failed"), never the
      // underlying exception.
      if (req.method === 'POST' && routePath === '/diag') {
        const body = JSON.parse((await readBody(req)) || '{}')
        appendDiag(clientLogFile, Object.assign({ at: new Date().toISOString() }, body))
        return json(res, 200, { ok: true })
      }
      if (req.method === 'GET' && routePath === '/settings') {
        return json(res, 200, { settings, defaults: DEFAULT_SETTINGS, repairs })
      }
      if (req.method === 'PUT' && routePath === '/settings') {
        const body = JSON.parse((await readBody(req)) || '{}')
        if (!persistSettings({ ...settings, ...body })) {
          return json(res, 500, { error: { code: 'WRITE_FAILED', message: '设置写入磁盘失败。' } })
        }
        // The audit travels with the reply so the settings page can show the user
        // what was repaired — a value that silently changes on save is the
        // "设置和实际不一样" complaint, and an explanation turns it into a notice.
        return json(res, 200, { settings, repairs })
      }
      if (req.method === 'GET' && routePath === '/providers') {
        try {
          const providers = ctx.llm.listProviders()
          return json(res, 200, { providers })
        } catch (error) {
          hostLog('providers-failed', { reason: String(error?.message ?? error) })
          return json(res, 200, { providers: [], warning: String(error?.message ?? error) })
        }
      }
      // 某个 provider 对外公布的模型清单（m12517：设置页的 Model id 从手填改成
      // 下拉选择）。ctx.llm.listModels 是 adapter 自己的目录，可能为空——有些
      // adapter 不公布清单，而核心路由本身允许未列出的 id，所以客户端必须保留
      // 手填这条路，不能把「列表空」当成「这个 provider 没有模型」。
      //
      // m20822：只问 adapter 会让「增强模型」下拉只剩一项。DSH 的 pi-ai adapter
      // 把模型写在 provider 配置里（cordis.patch.yml 的 llm-pi-ai →
      // providers.<id>.models[]），listModels 未必把它们报出来。所以这里合并
      // 两条来源：adapter 报的清单 + provider 配置里声明的 models[]，去重。
      if (req.method === 'GET' && routePath === '/models') {
        const provider = url.searchParams.get('provider') || ''
        if (!provider) return json(res, 200, { models: [] })
        const seen = new Set()
        const out = []
        const push = (id, name) => {
          const key = String(id || '').trim()
          if (!key || seen.has(key)) return
          seen.add(key)
          out.push({ id: key, name: String(name || key) })
        }
        const warnings = []
        try {
          const models = await ctx.llm.listModels(provider)
          for (const m of Array.isArray(models) ? models : []) push(m?.id, m?.name)
        } catch (error) {
          warnings.push(String(error?.message ?? error))
          hostLog('models-failed', { provider, reason: String(error?.message ?? error) })
        }
        // 兜底：provider 配置里声明的 models[]（magpie / pi-ai 就是这么配的）
        try {
          const providers = await ctx.llm.listProviders()
          const hit = (Array.isArray(providers) ? providers : []).find((p) => p && p.id === provider)
          const declared = hit && hit.config && Array.isArray(hit.config.models) ? hit.config.models : null
          const own = hit && Array.isArray(hit.models) ? hit.models : null
          for (const m of declared || own || []) push(m?.id, m?.name)
        } catch (error) {
          warnings.push(String(error?.message ?? error))
          hostLog('models-config-failed', { provider, reason: String(error?.message ?? error) })
        }
        const body = { models: out }
        if (warnings.length) body.warning = warnings.join('; ')
        return json(res, 200, body)
      }
      if (req.method === 'GET' && routePath === '/route') {
        const sessionId = url.searchParams.get('sessionId') ?? undefined
        const route = resolveRoute({ sessionId })
        // A null route is the "没有可用的模型路由" path: the client turns it into
        // a message, the journal records why it happened (no session sent yet and
        // no model pinned) so it can be diagnosed without a terminal.
        if (!route) hostLog('enhance-route-missing', { sessionId: sessionId ?? null })
        return json(res, 200, { route, settings })
      }
      if (req.method === 'POST' && routePath === '/enhance') {
        const body = JSON.parse((await readBody(req)) || '{}')
        const result = await runEnhance(body)
        return json(res, result.ok ? 200 : 400, result.ok ? result.value : { error: result.error })
      }
      // m14339 ⑬：中英互译（自建提示词要存中英两份，英文那份才是真正发出去的）。
      if (req.method === 'POST' && routePath === '/translate') {
        const body = JSON.parse((await readBody(req)) || '{}')
        const result = await runTranslate(body)
        return json(res, result.ok ? 200 : 400, result.ok ? result.value : { error: result.error })
      }
      return json(res, 404, { error: { code: 'NOT_FOUND', message: `no route ${req.method} ${routePath}` } })
    } catch (error) {
      logger.warn(`prompt-chain: api error (${error?.message ?? error})`)
      hostLog('api-error', { message: String(error?.message ?? error), stack: String(error?.stack ?? '').slice(0, 4000) })
      return json(res, 500, { error: { code: 'INTERNAL', message: String(error?.message ?? error) } })
    }
  }

  // The routes mount in their own fiber: a composition without a web server
  // must not take the plugin down, and ctx.inject waits for `webServer` even
  // when it appears after this plugin loaded.
  //
  // Guarded on purpose. This entry is composed by the profile, so anything that
  // throws here marks the whole entry failed and the harness refuses to start;
  // a missing `inject` facility should instead cost only the HTTP surface.
  if (typeof ctx.inject !== 'function') {
    logger.warn('prompt-chain: ctx.inject is unavailable; the settings API is not mounted')
    hostLog('api-not-mounted', { reason: 'ctx.inject is unavailable; the web server service never appeared' })
    return
  }
  ctx.inject(['webServer'], scoped => {
    scoped.effect(
      () => scoped.webServer.register({ kind: 'prefix', path: '/api/prompt-chain', handler: api }),
      'prompt-chain: api routes',
    )
    logger.info('prompt-chain: settings API mounted at /api/prompt-chain')
    hostLog('api-mounted', { path: '/api/prompt-chain', home: dataDir })
  })
}
