/**
 * Prompt Enhance — shared config + defaults (host & client agree on these).
 *
 * @module src/config.js
 */

/** Default settings as persisted in the entry config (all plain JSON). */
export const DEFAULT_SETTINGS = {
  /** `null` → follow the session's current model. */
  provider: null,
  model: null,
  /** 'auto' derives the output language from the draft. */
  language: 'auto',
  /** maxTokens for the rewrite call. */
  maxTokens: 2048,
  /**
   * Custom system prompt (m13797: "系统提示词我希望是可以自定义的").
   *
   * Empty = `DEFAULT_SYSTEM_PROMPT_BODY` (the "内置默认" preset). Non-empty
   * replaces that *role* half of the system prompt; the output contract ("only
   * the rewritten prompt, no preamble, no code fence") is always appended by the
   * builders, because losing it silently breaks the panel — the model starts
   * explaining itself and that explanation lands in the user's input box.
   *
   * m14036: the settings page now shows this text in an editable box, so what the
   * user sees is literally what gets sent (plus the appended contract, which
   * 「查看最终提示词」 shows in full).
   *
   * This field replaces the old `customPrompt` ("附加指令", m13797: "有了这个
   * 就可以取消附加指令这功能因为功能就相似了"). A config that still carries one is
   * migrated here by normalizeSettings, so nobody's text disappears.
   */
  systemPrompt: '',
  /**
   * Which preset the settings page has selected in the 「提示词方案」 dropdown.
   *
   * m14036: the user asked for one dropdown holding the built-in default *and*
   * the ready-made variants ("五个按钮改为下拉式选择的默认的也添加在这个下拉框
   * 中"), with the prompt text itself living in an editable box underneath. The id
   * only drives which row the dropdown shows as selected; the text that is
   * actually sent is `systemPrompt`.
   */
  promptId: 'default',
  /**
   * The user's own presets — at most 3 (m14036: "添加我的提示词最多添加3个自己
   * 的"). Each entry is `{ id, name, text, en }`: `text` is what the user typed and
   * `en` is the cached English rendering — the one that is actually sent, because
   * m14339 fixed the rule "丢给系统看的都是英文节省token". An empty `en` means
   * "not translated yet"; the settings page fills it on demand.
   */
  myPrompts: [],
  /**
   * m14339: "我还想做一个英文版的，一键中英切换就是整个操作界面是英文版的".
   * 'auto' follows the DSH locale, 'zh'/'en' force one — only this plugin's own
   * strings move, the rest of the app is untouched.
   */
  uiLang: 'auto',
  /**
   * m14315: "内置的单个表情包不能删除的问题". Built-in *groups* could already be
   * hidden (`hiddenGroups`); the built-in single emoji live in code, so the ones
   * the user deleted have to be remembered explicitly. Unknown/huge lists are
   * trimmed away below.
   */
  hiddenItems: [],
  /** Enhancement toast style: 'native' | 'minimal' | 'none'. */
  toastStyle: 'native',
  /** Trigger button style: 'circle' | 'text' | 'emoji'. */
  triggerStyle: 'circle',
  /**
   * The trigger icon — a single character *or* an image URI.
   *
   * m05885 merged the old 'image' style into this one field ("把自定义图片合并到
   * 自定义表情包这样就可以添加好多图片了"): one library holds emoji and images,
   * and whatever is picked here is what gets drawn (`<img>` for URIs, glyph
   * otherwise). `triggerIcon` is kept only as a migration source for configs
   * written before the merge — the renderer never writes it any more.
   */
  triggerEmoji: '',
  triggerIcon: '',
  /**
   * Horizontal nudge for the trigger button, in CSS pixels (negative = left).
   * Brought back by m05268 ("我说的调到 -240px 图标跑出去的问题不是要把这个
   * 功能删除") — the feature was never the problem, letting the icon leave the
   * input box was. The composer clamps it to the room its row actually has, so
   * any value stored here is a *wish*, not a promise.
   */
  triggerOffset: 0,
  /** Result panel background: 'clear' (see-through) | 'glass' | 'solid'. */
  panelBg: 'clear',
  /**
   * Background opacity in percent, applied on top of `panelBg`. 100 means the
   * bg-* mode's own colour; lower mixes in transparency, so the text behind the
   * panel stays readable even in 'solid'.
   */
  panelOpacity: 100,
  /**
   * The user's own icon library ("我的"). Entries are emoji *or* small image
   * data URIs (m05885 merged the upload path in here). Without this key the
   * host's sanitizer would drop it and the list would vanish on the next
   * restart (m03914).
   */
  myEmojis: [],
  /**
   * Self-made / installed emoji packs. Each one is an extra category tab:
   * `{ key, icon, items: string[] }`. Store packs land here too, so an installed
   * pack can be deleted exactly like a hand-made one (m05885).
   */
  myGroups: [],
  /**
   * Built-in categories the user deleted. Their emoji also disappear from "全部"
   * — that is what m05885 chose when asked ("连该分类里的表情一起删掉").
   */
  hiddenGroups: [],
}

/** Built-in emoji palette offered on the settings page (表情库). */
export const EMOJI_PRESETS = ['✨', '🌟', '💫', '🪄', '🧠', '🤖', '🐱', '🐳', '🌸', '🍀', '⚡', '🔥']

/** Largest `data:` icon we keep, in characters. ≈1.4 MB of PNG. */
export const MAX_ICON_CHARS = 2_000_000

/** Hard caps for the user's own library / packs (hand-edited configs included). */
export const MAX_MY_ITEMS = 60
export const MAX_MY_GROUPS = 12
export const MAX_GROUP_ITEMS = 40

/** Output language options. */
export const LANGUAGES = ['auto', 'zh', 'en']

/**
 * The default rewrite body — the "内置默认" entry of the preset dropdown.
 *
 * m14036 removed the old `style` fragments ("不要改写风格"): the ready-made
 * variants are now whole prompt bodies living in the client's preset table
 * (client.js `PROMPT_TEMPLATES`), and this is the one they all fall back to.
 * The client keeps its own copy because it renders the box; `_t7.mjs` asserts
 * the two stay equal, so they cannot drift apart unnoticed.
 */
export const DEFAULT_SYSTEM_PROMPT_BODY = `You are a prompt engineer. Rewrite the user's rough draft into a precise, executable prompt for an AI coding assistant.

Method:
1. Identify the goal, the inputs and context, the constraints, the expected deliverable, and how completion can be verified.
2. Make the implicit explicit — name the file, path, technology, command or number the draft implies — but never invent a requirement the draft does not carry.
3. Restructure the result so the agent can act without asking follow-up questions: goal first, then context, then requirements, then the concrete steps or deliverable, then the acceptance check.
4. Keep every explicit requirement, path, identifier, version and number from the original exactly as written.
5. Remove greetings, backstory, repetition, and anything that does not change what the agent does.

Output shape:
- One title line stating the task, followed by labelled sections (Goal, Context, Requirements, Steps, Acceptance) when the draft carries enough content for them; otherwise a single tight paragraph.
- Imperative mood, addressed to the agent, plain text only.`

/**
 * Whether `icon` is an image reference a browser can actually load.
 *
 * The 4000-char cap that used to truncate every upload produced a `data:` URI
 * whose base64 body had an illegal length (3977 chars → 3977 % 4 === 1), which
 * the browser silently refuses to decode — leaving a blank hole where the
 * button should be. The cap is gone, but a hand-edited or stale config can
 * still carry a broken URI, so the host rejects the ones it can prove are
 * undecodable instead of handing them to the renderer.
 *
 * Only *provably* broken values are rejected: a syntactically valid data URI
 * that happens to hold a tiny or non-image payload is left alone, because the
 * host cannot decode an image and the client already probes the real decode.
 */
export function isUsableImageUri(icon) {
  if (typeof icon !== 'string' || icon === '') return false
  if (icon.startsWith('data:')) {
    // data:image/<type>[;charset=..][;base64],<payload>
    const match = /^data:image\/[a-z0-9.+-]+(?:;charset=[^;,]*)?(;base64)?,/i.exec(icon)
    if (!match) return false
    const body = icon.slice(match[0].length).replace(/\s+/g, '')
    if (body === '') return false
    // Only base64 payloads are structurally checkable; percent-encoded bodies
    // are accepted as-is.
    if (!match[1]) return true
    if (/[^A-Za-z0-9+/=]/.test(body)) return false
    const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
    const core = body.slice(0, body.length - padding)
    if (/=/.test(core)) return false
    // A base64 body's length must be a multiple of 4; a remainder of 1 means the
    // value was cut mid-quantum and cannot be decoded at all.
    return body.length % 4 === 0
  }
  return /^(https?:\/\/|\/|blob:)/.test(icon)
}

/**
 * Normalise one library entry: either a short glyph or an image reference.
 *
 * The library holds both kinds since m05885 ("把自定义图片合并到自定义表情包"),
 * so the shape is decided by the value itself — a URI must survive whole (and
 * pass the same decodability probe the icon used to), anything else is treated
 * as a glyph and trimmed to a single short cluster.
 */
export function normalizeIconItem(value) {
  if (typeof value !== 'string') return ''
  const v = value.trim()
  if (v === '') return ''
  if (v.startsWith('data:') || /^(https?:\/\/|blob:|\/)/.test(v)) {
    const uri = v.slice(0, MAX_ICON_CHARS)
    return isUsableImageUri(uri) ? uri : ''
  }
  return v.slice(0, 8)
}

/** Clamp helpers so a hand-edited config can't poison the call. */
export function normalizeSettings(raw) {
  const src = raw !== null && typeof raw === 'object' ? raw : {}
  const out = {
    ...DEFAULT_SETTINGS,
    // 这三个是数组：必须复制一份再改。否则下面的迁移会直接 push 进
    // DEFAULT_SETTINGS 的数组，被后续每一次调用看见（曾经把一张图片
    // 一路带进别人的配置里）。
    myEmojis: Array.isArray(DEFAULT_SETTINGS.myEmojis) ? DEFAULT_SETTINGS.myEmojis.slice() : [],
    myGroups: [],
    hiddenGroups: [],
  }
  if (typeof src.provider === 'string' && src.provider !== '') out.provider = src.provider
  if (typeof src.model === 'string' && src.model !== '') out.model = src.model
  if ((out.provider === null) !== (out.model === null)) {
    // Half a route is no route; fall back to following the session.
    out.provider = null
    out.model = null
  }
  if (LANGUAGES.includes(src.language)) out.language = src.language
  const tokens = Number(src.maxTokens)
  if (Number.isFinite(tokens)) out.maxTokens = Math.min(32768, Math.max(128, Math.round(tokens)))
  // m13797：系统提示词可自定义（最长 8000 字符，够放一大段规则）。旧配置里的
  // 「附加指令」在这里迁进来——用户说这两个功能相似，那就别让旧文本消失。
  if (typeof src.systemPrompt === 'string' && src.systemPrompt.trim() !== '') out.systemPrompt = src.systemPrompt.slice(0, 8000)
  else if (typeof src.customPrompt === 'string' && src.customPrompt.trim() !== '') out.systemPrompt = src.customPrompt.slice(0, 8000)
  // m14036：自己的提示词最多 3 条，每条只是名字 + 正文。名字和 id 都收紧长度，
  // 正文和系统提示词同一个上限——它是同一段文字，只是存下来反复用。
  if (Array.isArray(src.myPrompts)) {
    const mine = []
    for (const raw of src.myPrompts) {
      if (mine.length >= 3) break
      if (!raw || typeof raw !== 'object') continue
      const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 40) : ''
      const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 8000) : ''
      if (id === '' || text === '') continue
      const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : ''
      // m14339：中文原文（text）和你实际会看的译文（zh）之外，还要存一份"发出去
      // 用的英文"（en）。中文/译文都不发送，只躺在配置里，所以多存一份不花 token；
      // en 为空表示还没翻过，客户端会按需去翻再写回。
      const en = typeof raw.en === 'string' ? raw.en.trim().slice(0, 8000) : ''
      mine.push({ id, name: name === '' ? id : name, text, en })
    }
    out.myPrompts = mine
  }
  if (typeof src.promptId === 'string' && src.promptId.trim() !== '') out.promptId = src.promptId.trim().slice(0, 40)
  // m12517：提示样式只剩两档（原生气泡 / 隐藏）。旧配置里的 'minimal' 落到
  // 默认的 'native'，用户不会因为一个已删掉的档位而看到空白面板。
  if (['native', 'none'].includes(src.toastStyle)) out.toastStyle = src.toastStyle
  // m05885: the separate 'image' style is gone — one custom-icon library now
  // holds emoji *and* images, so an old config lands on 'emoji' (which draws
  // whatever it is given) instead of on a style that no longer exists.
  if (src.triggerStyle === 'image') out.triggerStyle = 'emoji'
  else if (['circle', 'text', 'emoji'].includes(src.triggerStyle)) out.triggerStyle = src.triggerStyle
  // The icon is only meaningful for the custom style. It may be a glyph or an
  // image reference now, so both go through the same entry normaliser; a value
  // that is neither stays empty rather than rendering as a blank hole.
  //
  // The cap is deliberately generous: a JPEG of a hand-drawn avatar is ~60 KB
  // base64 (~80 K chars). The old 4000-char cap chopped every upload into an
  // undecodable prefix, which is exactly the "图片无法显示" the user saw.
  if (typeof src.triggerEmoji === 'string') {
    const icon = normalizeIconItem(src.triggerEmoji)
    if (icon !== '') out.triggerEmoji = icon
  }
  if (typeof src.triggerIcon === 'string' && src.triggerIcon.trim() !== '') {
    // Migration only: before the merge an uploaded image lived in `triggerIcon`
    // (and, even earlier, a custom emoji did). Move it into the merged field and
    // into the library, so switching styles can never lose the picture again
    // (m04492 "来回点自定义表情/图片时图片也被存下来").
    // 必须放在 myEmojis 归一化**之后**：那段会用 src 重建数组，先迁移会被覆盖掉。
    const icon = normalizeIconItem(src.triggerIcon)
    if (icon !== '') {
      if (out.triggerEmoji === '') out.triggerEmoji = icon
      if (out.myEmojis.indexOf(icon) === -1 && out.myEmojis.length < MAX_MY_ITEMS) out.myEmojis.unshift(icon)
    }
  }
  // Horizontal nudge. Clamped to a sane band here so a hand-edited config can
  // never park the button an arbitrary distance away; the composer narrows it
  // further to whatever room its row actually has.
  const offset = Number(src.triggerOffset)
  if (Number.isFinite(offset)) out.triggerOffset = Math.min(240, Math.max(-240, Math.round(offset)))
  if (['clear', 'glass', 'solid'].includes(src.panelBg)) out.panelBg = src.panelBg
  const opacity = Number(src.panelOpacity)
  if (Number.isFinite(opacity)) out.panelOpacity = Math.min(100, Math.max(10, Math.round(opacity)))
  if (Array.isArray(src.myEmojis)) {
    // 只收合法条目（emoji 或可解码的图片 URI）、去重、封顶：手改配置时写进来
    // 一坨垃圾不会带到 UI，图片也不会无限膨胀配置。
    const list = []
    for (const item of src.myEmojis) {
      const value = normalizeIconItem(item)
      if (value === '' || list.indexOf(value) !== -1) continue
      list.push(value)
      if (list.length >= MAX_MY_ITEMS) break
    }
    out.myEmojis = list
  }
  if (typeof src.triggerIcon === 'string' && src.triggerIcon.trim() !== '') {
    // Migration only: before the merge an uploaded image lived in `triggerIcon`
    // (and, even earlier, a custom emoji did). Move it into the merged field and
    // into the library, so switching styles can never lose the picture again
    // (m04492 「来回点自定义表情/图片时图片也被存下来」).
    // 放在 myEmojis 归一化之后：那段会按 src 重建数组，先迁移会被它覆盖掉。
    const icon = normalizeIconItem(src.triggerIcon)
    if (icon !== '') {
      if (out.triggerEmoji === '') out.triggerEmoji = icon
      if (out.myEmojis.indexOf(icon) === -1 && out.myEmojis.length < MAX_MY_ITEMS) out.myEmojis.unshift(icon)
    }
  }
  if (Array.isArray(src.myGroups)) {
    // 自建 / 从商店装进来的表情包。key 只用来做选择器的身份，所以限制成短
    // 标识符，免得手改配置里塞一个对象进来把 React 的 key 弄炸。
    const groups = []
    const seen = {}
    for (const raw of src.myGroups) {
      if (raw === null || typeof raw !== 'object') continue
      const key = typeof raw.key === 'string' ? raw.key.trim().slice(0, 40) : ''
      if (key === '' || seen[key] === true) continue
      seen[key] = true
      const items = []
      const rawItems = Array.isArray(raw.items) ? raw.items : []
      for (const item of rawItems) {
        const value = normalizeIconItem(item)
        if (value === '' || items.indexOf(value) !== -1) continue
        items.push(value)
        if (items.length >= MAX_GROUP_ITEMS) break
      }
      const icon = normalizeIconItem(raw.icon)
      // 名字要留着：自建包在界面上显示的是 name（商店装来的包用词条名），
      // 丢了就只能显示 custom-xxxx 这种机器名（m05885 的「自己定义的包」）。
      const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : ''
      groups.push({ key, name, icon: icon !== '' ? icon : (items[0] || '✨'), items })
      if (groups.length >= MAX_MY_GROUPS) break
    }
    out.myGroups = groups
  }
  if (Array.isArray(src.hiddenGroups)) {
    const hidden = []
    for (const key of src.hiddenGroups) {
      if (typeof key !== 'string') continue
      const trimmed = key.trim().slice(0, 40)
      if (trimmed === '' || hidden.indexOf(trimmed) !== -1) continue
      hidden.push(trimmed)
      if (hidden.length >= 32) break
    }
    out.hiddenGroups = hidden
  }
  // m14315：内置单个表情也要能删。表情本身写在客户端代码里，删不掉，所以只能把
  // "被删掉的那些"记下来（形状和 hiddenGroups 一样：去重、限长、限个数）。
  if (Array.isArray(src.hiddenItems)) {
    const hiddenItems = []
    for (const item of src.hiddenItems) {
      if (typeof item !== 'string') continue
      const trimmed = item.trim()
      if (trimmed === '' || hiddenItems.indexOf(trimmed) !== -1) continue
      // 图片/动图是 data URI，比普通表情长得多，但也不能无限——超长的一律当脏数据丢掉。
      if (trimmed.length > 400000) continue
      hiddenItems.push(trimmed)
      if (hiddenItems.length >= 200) break
    }
    out.hiddenItems = hiddenItems
  }
  // m14339：整个插件界面的一键中英切换（'auto' 跟随 DSH）。
  if (['auto', 'zh', 'en'].includes(src.uiLang)) out.uiLang = src.uiLang
  return out
}

/** One shared language rule so every mode picks the same output language. */
function languageRule(settings) {
  return settings.language === 'zh' ? 'Write the output in Chinese.'
    : settings.language === 'en' ? 'Write the output in English.'
    : 'Use the same language as the original prompt.'
}

/**
 * Assemble a mode's system prompt from a role/style block plus a fixed contract.
 *
 * m13797 made the role block user-editable ("系统提示词我希望是可以自定义的"):
 * `settings.systemPrompt` replaces `roleLines` when it is non-empty. The
 * contract lines are *never* replaceable — they are what keeps a reply usable as
 * a prompt (only the result, no preamble, no code fence, don't answer it), and a
 * config that loses them produces panels full of the model's own commentary.
 */
function composeSystemPrompt(settings, roleLines, contractLines) {
  const custom = typeof settings.systemPrompt === 'string' ? settings.systemPrompt.trim() : ''
  const role = custom !== '' ? [custom] : roleLines
  return role.concat([languageRule(settings), 'Rules:'], contractLines).filter(Boolean).join('\n')
}

/** Built-in system prompt for the rewrite call. */
export function enhanceSystemPrompt(settings) {
  return composeSystemPrompt(settings, [DEFAULT_SYSTEM_PROMPT_BODY], [
    '- Output ONLY the rewritten prompt as plain text — no quotes, no preamble, no explanation, no Markdown code fences around the whole answer.',
    '- Preserve every explicit requirement, path, identifier and number from the original.',
    '- Never invent requirements the original does not imply.',
    '- Do not answer the prompt; rewrite it.',
  ])
}

/**
 * Built-in system prompt for "continue writing" (继续生成).
 *
 * The answer is appended to the existing text by the caller, so the model must
 * emit the continuation ONLY — repeating the original would duplicate it.
 */
export function continueSystemPrompt(settings) {
  return composeSystemPrompt(settings, [
    'The user is still writing a prompt for an AI coding assistant and has stopped mid-thought. Continue that prompt from exactly where it ends.',
  ], [
    '- Output ONLY the continuation as plain text — never repeat, summarise or quote the original text.',
    '- If the original stops mid-sentence or mid-word, finish that sentence first, then keep going.',
    '- Add the concrete detail the user most plausibly wants next: constraints, inputs and outputs, edge cases, acceptance criteria.',
    '- Never contradict or invent facts, paths, numbers or requirements that conflict with the original.',
    '- No preamble, no explanation, no Markdown code fence around the whole answer.',
  ])
}

/**
 * Frame the draft as the single user message.
 *
 * m15602：`context` 参数删除了。客户端从来不往 /enhance 里发上文（body 只有
 * text/sessionId/mode/模型），所以原来那段「参考会话上文 2000 字」永远不触发；
 * 用户也确认不需要参考上文——正文就是唯一输入，少一个隐形的截断来源。
 */
export function enhanceUserText(draft) {
  return `Rewrite this prompt:\n\n${draft}`
}

/** Frame the in-progress prompt as the single user message for a continuation. */
export function continueUserText(draft) {
  return `Continue this prompt. It stops here:\n\n${draft}`
}
