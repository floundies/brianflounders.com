// src/components/PostView.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { marked } from 'marked'
import StatsBar from './StatsBar'
import { HashtagText, linkifyHashtagsInHtml } from './HashtagText'

function relaysFromEnv() {
  const s = (import.meta.env.VITE_RELAYS as string) || ''
  const arr = s.split(',').map(t => t.trim()).filter(Boolean)
  return arr.length ? arr : [
    'wss://relay.primal.net',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
  ]
}

export default function PostView({ id }: { id: string }) {
  const [ev, setEv] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')

  const [canEdit, setCanEdit] = useState(false)
  const commentsRef = useRef<HTMLDivElement | null>(null)

  // -------- load the event (id / note / nevent / naddr) ----------
  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        setLoading(true); setErr('')
        const { SimplePool, nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')

        let filter: any
        if (id.startsWith('naddr1') || id.startsWith('nevent1') || id.startsWith('note1')) {
          const dec = nip19.decode(id)
          if (dec.type === 'naddr') {
            const p = dec.data
            filter = { kinds: [p.kind], authors: [p.pubkey] }
            if (p.kind === 30023 && p.identifier) filter['#d'] = [p.identifier]
          } else if (dec.type === 'nevent') filter = { ids: [dec.data.id] }
          else if (dec.type === 'note') filter = { ids: [dec.data] }
        } else {
          filter = { ids: [id] }
        }

        const pool = new SimplePool()
        const relays = relaysFromEnv()
        const event = await pool.get(relays, filter)
        if (stop) return
        if (!event) { setErr('Post not found on current relays'); setEv(null) }
        else setEv(event)
      } catch (e:any) {
        if (!stop) setErr(e?.message || String(e))
      } finally {
        if (!stop) setLoading(false)
      }
    })()
    return () => { stop = true }
  }, [id])

  // -------- allow Edit if your pubkey matches ----------
  useEffect(() => {
    ;(async () => {
      try {
        if (!ev) { setCanEdit(false); return }
        const ext = (window as any).nostr
        if (!ext?.getPublicKey) { setCanEdit(false); return }
        const k = await ext.getPublicKey()
        setCanEdit(k === ev.pubkey)
      } catch { setCanEdit(false) }
    })()
  }, [ev])

  /* -------------------- HERO extraction (same as list) -------------------- */
  const URL_REGEX = /https?:\/\/[^\s<>'"()]+/gi
  const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|avif)(?:\?.*)?$/i
  const VIDEO_EXT_REGEX = /\.(?:mp4|webm|mov|m4v)(?:\?.*)?$/i
  const AUDIO_EXT_REGEX = /\.(?:mp3|wav|ogg|m4a)(?:\?.*)?$/i
  const ALLOWED_HOSTS = new Set<string>([
    'm.primal.net',
    'primal.net',
    'blossom.primal.net',
    'image.nostr.build', 'i.nostr.build', 'nostr.build', 'void.cat',
  ])
  function isAllowedHost(host: string): boolean {
    return ALLOWED_HOSTS.has(host) || host.endsWith('.primal.net')
  }

  function isHttpUrl(u: string): boolean {
    try { const url = new URL(u); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false }
  }
  function isAllowedImageUrl(u: string): boolean {
    try { const url = new URL(u); return isAllowedHost(url.hostname) && IMAGE_EXT_REGEX.test(url.pathname + url.search) } catch { return false }
  }
  function isAllowedVideoUrl(u: string): boolean {
    try {
      const url = new URL(u)
      return VIDEO_EXT_REGEX.test(url.pathname + url.search)
    } catch { return false }
  }
  function isAllowedAudioUrl(u: string): boolean {
    try {
      const url = new URL(u)
      return AUDIO_EXT_REGEX.test(url.pathname + url.search)
    } catch { return false }
  }
  function extractAllowedFrom(text: string): string[] {
    return (text.match(URL_REGEX) || []).filter(isAllowedImageUrl)
  }
  function extractAllowedVideosFrom(text: string): string[] {
    return (text.match(URL_REGEX) || []).filter(isAllowedVideoUrl)
  }
  function extractAllowedAudioFrom(text: string): string[] {
    return (text.match(URL_REGEX) || []).filter(isAllowedAudioUrl)
  }
  function embedInlineAudio(md: string): string {
    const lines = md.split(/\n/)
    const out: string[] = []
    for (let line of lines) {
      const trimmed = line.trim()

      // Case A: raw URL on its own line
      const rawMatch = (trimmed.match(URL_REGEX) || [])[0]
      if (rawMatch && isAllowedAudioUrl(rawMatch) && trimmed === rawMatch) {
        out.push(`<audio src="${rawMatch}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>`)
        continue
      }

      // Case B: <https://...> autolink style on its own line
      const angleMatch = /^<\s*(https?:\/\/[^\s<>'"()]+)\s*>$/i.exec(trimmed)
      if (angleMatch && isAllowedAudioUrl(angleMatch[1])) {
        out.push(`<audio src="${angleMatch[1]}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>`)
        continue
      }

      // Case C: HTML anchor tag on its own line
      const aTagMatch = /^<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>\s*$/i.exec(trimmed)
      if (aTagMatch && isAllowedAudioUrl(aTagMatch[1])) {
        const text = (aTagMatch[2] || '').trim()
        if (!text || text === aTagMatch[1]) {
          out.push(`<audio src="${aTagMatch[1]}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>`)
          continue
        }
      }

      // Case D: Markdown link on its own line: [text](url) — embed if text equals the URL or is empty
      const mdLinkMatch = /^\[([^\]]*)\]\((https?:\/\/[^)]+)\)\s*$/i.exec(trimmed)
      if (mdLinkMatch && isAllowedAudioUrl(mdLinkMatch[2])) {
        const text = (mdLinkMatch[1] || '').trim()
        if (!text || text === mdLinkMatch[2]) {
          out.push(`<audio src="${mdLinkMatch[2]}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>`)
          continue
        }
      }

      out.push(line)
    }
    return out.join('\n')
  }

  function getHeroMedia(ev: any): { type?: 'video' | 'image'; url?: string; cameFromBody?: boolean } {
    if (!ev) return {}
    // prefer explicit tags first
    const tagKeysImage = new Set(['image','thumb','cover','banner'])
    const tagKeysVideo = new Set(['video','movie'])
    const firstTagVal = (keys: Set<string>) => (ev.tags || []).find((tt: string[]) => keys.has(tt[0]))?.[1]
    const isLongForm = ev.kind === 30023

    // 1) explicit image tag — for long-form posts, banner image always wins
    //    No allowed-hosts check here — author intentionally set this tag
    const ti = firstTagVal(tagKeysImage)
    if (ti && isHttpUrl(ti)) return { type: 'image', url: ti, cameFromBody: false }

    // 2) explicit video tag — hero only if no image tag exists
    const tv = firstTagVal(tagKeysVideo)
    if (tv && isHttpUrl(tv)) return { type: 'video', url: tv, cameFromBody: false }

    // 3) imeta variants (video or image)
    const imetas = (ev.tags || []).filter((tt: string[]) => tt[0] === 'imeta')
    for (const im of imetas) {
      for (const part of im.slice(1)) {
        const hit = (part.match(URL_REGEX) || [])[0]
        if (hit && isHttpUrl(hit)) {
          if (isAllowedVideoUrl(hit)) return { type: 'video', url: hit, cameFromBody: false }
          if (isAllowedImageUrl(hit)) return { type: 'image', url: hit, cameFromBody: false }
        }
        const mEq = /^url\s*=\s*(https?:\/\/\S+)$/i.exec(part); if (mEq && isHttpUrl(mEq[1])) {
          const u = mEq[1]; if (isAllowedVideoUrl(u)) return { type:'video', url:u, cameFromBody:false }; if (isAllowedImageUrl(u)) return { type:'image', url:u, cameFromBody:false }
        }
        const mColon = /^url\s*:\s*(https?:\/\/\S+)$/i.exec(part); if (mColon && isHttpUrl(mColon[1])) {
          const u = mColon[1]; if (isAllowedVideoUrl(u)) return { type:'video', url:u, cameFromBody:false }; if (isAllowedImageUrl(u)) return { type:'image', url:u, cameFromBody:false }
        }
        const mSpace = /^url\s+(https?:\/\/\S+)$/i.exec(part); if (mSpace && isHttpUrl(mSpace[1])) {
          const u = mSpace[1]; if (isAllowedVideoUrl(u)) return { type:'video', url:u, cameFromBody:false }; if (isAllowedImageUrl(u)) return { type:'image', url:u, cameFromBody:false }
        }
      }
    }

    // 4) first allow-listed media in content
    // For long-form posts, prefer image from body (video should stay inline)
    // For short notes, prefer video from body
    if (!isLongForm) {
      const videoFromBody = extractAllowedVideosFrom(ev.content || '')[0]
      if (videoFromBody) return { type: 'video', url: videoFromBody, cameFromBody: true }
    }
    const imageFromBody = extractAllowedFrom(ev.content || '')[0]
    if (imageFromBody) return { type: 'image', url: imageFromBody, cameFromBody: true }
    return {}
  }

  const { type: heroType, url: heroUrl, cameFromBody } = useMemo(() => getHeroMedia(ev), [ev])

  // -------- metadata ----------
const title = useMemo(() => {
  if (!ev) return ''
  // For short notes, don't promote the content line to a header.
  // Just render the body once below.
  if (ev.kind === 1) return ''
  return (
    ev.tags.find((t: string[]) => t[0] === 'title')?.[1] ||
    ev.content.split('\n')[0]?.replace(/^#\s*/, '') ||
    'Untitled'
  )
}, [ev])

  const summary = useMemo(() => {
    if (!ev) return ''
    return ev.tags.find((t: string[]) => t[0] === 'summary')?.[1] || ''
  }, [ev])

  const ts = useMemo(
    () => ev ? dayjs((ev.created_at || 0) * 1000).format('MMM D, YYYY') : '',
    [ev]
  )

  // Set document title and fire GA once post title is loaded from Nostr
  useEffect(() => {
    if (!title && (!ev || ev.kind !== 1)) return
    const dTag = ev?.tags?.find((t: string[]) => t[0] === 'd')?.[1] || ''
    const pageTitle = title ? `${title} — brianflounders.com` : 'brianflounders.com'
    const pagePath = dTag ? `/post/${dTag}` : `/post/${ev?.id?.slice(0, 12) || 'note'}`
    document.title = pageTitle
    const sendGA = (window as any).__sendPageView
    sendGA?.(pagePath, pageTitle)
  }, [title, ev])

  // Collect video URLs from imeta tags (these may not have file extensions)
  function getImetaVideoUrls(ev: any): Set<string> {
    const urls = new Set<string>()
    if (!ev?.tags) return urls
    for (const tag of ev.tags) {
      if (tag[0] !== 'imeta') continue
      let url = '', isVideo = false
      for (const part of tag.slice(1)) {
        const mUrl = /^url\s+(.+)$/i.exec(part) || /^url=(.+)$/i.exec(part) || /^url:(.+)$/i.exec(part)
        if (mUrl) url = mUrl[1].trim()
        if (/^m\s+video\//i.test(part) || /^m=video\//i.test(part) || /^m:video\//i.test(part)) isVideo = true
      }
      if (url && isVideo) urls.add(url)
    }
    return urls
  }

  function embedInlineVideos(md: string): string {
    const imetaVideos = getImetaVideoUrls(ev)
    const videoTag = (u: string) => {
      const isMov = /\.mov(\?|$)/i.test(u)
      const fallback = isMov ? `<p style="font-size:13px;color:#9a9082;margin-top:6px"><a href="${u}" download style="color:#d4a854">Download video</a> if it doesn't play in your browser (.mov)</p>` : ''
      return `<video src="${u}#t=0.1" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>${fallback}`
    }
    const isVideo = (u: string) => isAllowedVideoUrl(u) || imetaVideos.has(u)

    // Process line by line to handle angle-bracket URLs and raw URLs
    return md.split('\n').map(line => {
      const trimmed = line.trim()
      // Case: <https://...mov> on its own line
      const angle = /^<\s*(https?:\/\/[^\s<>]+)\s*>$/.exec(trimmed)
      if (angle && isVideo(angle[1])) return videoTag(angle[1])
      // Case: [url](url) on its own line
      const mdLink = /^\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/.exec(trimmed)
      if (mdLink && isVideo(mdLink[2])) return videoTag(mdLink[2])
      // Case: raw URL anywhere in the line
      return line.replace(/(https?:\/\/[^\s<>'"()]+)/ig, (u) => {
        if (!isVideo(u)) return u
        return videoTag(u)
      })
    }).join('\n')
  }

  const html = useMemo(() => {
    const raw = ev?.content || ''
    // Remove hero URL in raw, <a>, or markdown-link forms when it came from body
    function stripHeroOnce(text: string, url: string): string {
      // raw
      let t = text.replace(url, '')
      // angle bracket
      t = t.replace(new RegExp(String.raw`<\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*>`, 'i'), '')
      // html anchor
      t = t.replace(new RegExp(String.raw`<a\s+[^>]*href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*<\/a>`, 'i'), '')
      // markdown link [url](url)
      t = t.replace(new RegExp(String.raw`\[\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\]\(\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*\)`, 'i'), '')
      return t
    }
    const body = (cameFromBody && heroUrl) ? stripHeroOnce(raw, heroUrl).replace(/\n{3,}/g, '\n\n').trim() : raw
    const parsed = marked.parse(embedInlineVideos(embedInlineAudio(body)))

    // FINAL FALLBACK: if anything slipped through pre-markdown processing,
    // convert paragraph-wrapped raw URLs in the generated HTML into <video> embeds.
    const htmlAfter = parsed
      // <p>https://...mp4</p>
      .replace(/<p>\s*(https?:\/\/[^\s<>'"()]+\.(?:mp4|webm|mov|m4v)(?:\?[^<]*)?)\s*<\/p>/ig, (_m, u) =>
        isAllowedVideoUrl(u) ? `<video src="${u}#t=0.1" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>` : _m
      )
      // <p><a href="https://...mp4">https://...mp4</a></p>
      .replace(/<p>\s*<a\s+[^>]*href="(https?:\/\/[^\"]+\.(?:mp4|webm|mov|m4v)(?:\?[^<]*)?)"[^>]*>\s*\1\s*<\/a>\s*<\/p>/ig, (_m, u) =>
        isAllowedVideoUrl(u) ? `<video src="${u}#t=0.1" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>` : _m
      )
      // <p>&lt;https://...mp4&gt;</p>
      .replace(/<p>\s*&lt;\s*(https?:\/\/[^\s<>'"()]+\.(?:mp4|webm|mov|m4v)(?:\?[^<]*)?)\s*&gt;\s*<\/p>/ig, (_m, u) =>
        isAllowedVideoUrl(u) ? `<video src="${u}#t=0.1" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>` : _m
      )
      // <p>https://...mp3</p>
      .replace(/<p>\s*(https?:\/\/[^\s<>'"()]+\.(?:mp3|wav|ogg|m4a)(?:\?[^<]*)?)\s*<\/p>/ig, (_m, u) =>
        isAllowedAudioUrl(u) ? `<audio src="${u}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>` : _m
      )
      // <p><a href="https://...mp3">https://...mp3</a></p>
      .replace(/<p>\s*<a\s+[^>]*href="(https?:\/\/[^\"]+\.(?:mp3|wav|ogg|m4a)(?:\?[^<]*)?)"[^>]*>\s*\1\s*<\/a>\s*<\/p>/ig, (_m, u) =>
        isAllowedAudioUrl(u) ? `<audio src="${u}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>` : _m
      )
      // <p>&lt;https://...mp3&gt;</p>
      .replace(/<p>\s*&lt;\s*(https?:\/\/[^\s<>'"()]+\.(?:mp3|wav|ogg|m4a)(?:\?[^<]*)?)\s*&gt;\s*<\/p>/ig, (_m, u) =>
        isAllowedAudioUrl(u) ? `<audio src="${u}" controls preload="metadata" style="max-width:100%;width:100%;margin:8px 0"></audio>` : _m
      )

    return linkifyHashtagsInHtml(htmlAfter)
  }, [ev, heroUrl, cameFromBody])

  // -------- comments: ZapThreads (iife) for comments only; hide its counts; fallback to NoComment ----------
  const injected = useRef(false)

  useEffect(() => {
    if (!ev || !commentsRef.current) return
    let cancelled = false
    if (injected.current && import.meta.env.DEV) return
    injected.current = true

    const relays = relaysFromEnv()
    const relaysJson = JSON.stringify(relays)

    const clean = () => {
      const c = commentsRef.current
      if (!c) return
      c.innerHTML = ''
    }

    const resolveAnchor = async () => {
  const { nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
  if (ev.kind === 30023) {
    const d = (ev.tags || []).find((t: string[]) => t[0] === 'd')?.[1] || ''
    if (d) return nip19.naddrEncode({ kind: ev.kind, pubkey: ev.pubkey, identifier: d })
  }
  // For regular notes, anchor on the note ID so we share threads with Primal and others.
  return nip19.noteEncode(ev.id)
}

    const mountNoComment = async () => {
      const anchor = await resolveAnchor() // raw naddr/nevent/note
      clean()
      const s = document.createElement('script')
      s.src = 'https://nocomment.fiatjaf.com/embed.js'
      s.id = 'nocomment'
      s.setAttribute('data-relays', relaysJson)
      s.setAttribute('data-placeholder', 'Write a comment…')
      s.setAttribute('data-owner', ev.pubkey)
      s.setAttribute('data-custom-base', anchor)
      s.setAttribute('data-skip', '/__none__')
      const c = commentsRef.current
      if (!c || cancelled) return
      c.appendChild(s)
      console.log('[comments] provider: nocomment')
    }

    const loadScript = (src: string) =>
      new Promise<boolean>((resolve) => {
        const s = document.createElement('script')
        s.src = src
        s.async = true
        s.onload = () => resolve(true)
        s.onerror = () => resolve(false)
        document.head.appendChild(s)
      })

    // hide zapthreads’ summary/zap row (attributes + defensive shadow patch)
    const hideZapThreadsChrome = (el: HTMLElement) => {
      el.setAttribute('show-zap-button', 'false')
      el.setAttribute('show-reaction-summary', 'false')
      const tryPatch = () => {
        const sr: any = (el as any).shadowRoot
        if (!sr) { requestAnimationFrame(tryPatch); return }
        const all = Array.from(sr.querySelectorAll<HTMLElement>('*'))
        for (const n of all) {
          const t = (n.textContent || '').toLowerCase()
          if (/\blikes?\b/.test(t) && /\bsats?\b/.test(t)) {
            n.style.display = 'none'
            break
          }
        }
      }
      tryPatch()
    }

    const mountZapThreads = async () => {
      const sources = [
        'https://unpkg.com/zapthreads@latest/dist/zapthreads.iife.js',
        'https://cdn.jsdelivr.net/npm/zapthreads@latest/dist/zapthreads.iife.js',
      ]
      const ensureDefined = async () => {
        if (customElements.get('zap-threads')) return true
        try {
          await Promise.race([
            customElements.whenDefined('zap-threads'),
            new Promise((_r, rej) => setTimeout(() => rej(new Error('define timeout')), 6000))
          ])
          return !!customElements.get('zap-threads')
        } catch { return false }
      }
      if (!customElements.get('zap-threads')) {
        for (const src of sources) {
          const ok = await loadScript(src)
          if (!ok) continue
          const def = await ensureDefined()
          if (def) break
        }
      }
      if (!customElements.get('zap-threads')) return false

      const relayList = relays.length ? relays.join(',') : 'wss://relay.primal.net'
      const anchorRaw = await resolveAnchor() // **raw NIP-19** (no nostr: prefix)

      clean()
      const el = document.createElement('zap-threads') as any
      el.setAttribute('anchor', anchorRaw)
      el.setAttribute('relays', relayList)
      el.setAttribute('theme', 'auto')
      el.setAttribute('publisher', 'nip07')
      hideZapThreadsChrome(el)

      const c = commentsRef.current
      if (!c || cancelled) return false
      c.appendChild(el)
      console.log('[comments] provider: zapthreads (<zap-threads>)')
      return true
    }

    const run = async () => {
      const c = commentsRef.current
      if (c) c.innerHTML = '<div class="meta">Loading comments…</div>'
      const ok = await mountZapThreads()
      if (!ok) await mountNoComment()
    }

    run()
    return () => { cancelled = true; injected.current = false; clean() }
  }, [ev?.id])

  // -------- jump to comments when 💬 clicked on list ----------
  useEffect(() => {
    if (!commentsRef.current) return
    if (sessionStorage.getItem('goto_comments') === '1') {
      commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      sessionStorage.removeItem('goto_comments')
    }
  }, [commentsRef.current])

  if (loading) return <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!ev) return <div className="card"><p className="meta">Post not found.</p></div>

  const hasHeroImage = heroUrl && heroType === 'image'
  const hasHeroVideo = heroUrl && heroType === 'video'

  return (
    <article className="post-article">

      {/* HERO with hybrid overlap layout (image only) */}
      {hasHeroImage && (
        <div className="post-hero-wrap">
          <div className="post-hero">
            <img
              src={heroUrl}
              alt=""
              loading="lazy"
            />
            {/* bottom gradient scrim */}
            <div className="post-hero__scrim" />
          </div>
          {/* Title overlaps bottom of hero via negative margin */}
          <div className="post-hero__overlay">
            {title && <h1 className="post-title post-title--hero"><HashtagText text={title} /></h1>}
            {summary && <p className="post-summary"><HashtagText text={summary} /></p>}
            <div className="meta post-hero__meta">
              <a href="#/" className="post-back">← Back</a>
              <span className="post-meta__sep">·</span>
              <span>{ts}</span>
            </div>
          </div>
        </div>
      )}

      {/* HERO video (no overlap — controls need to be visible) */}
      {hasHeroVideo && (
        <div style={{ margin: '0 -20px 24px', overflow: 'hidden', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 1', background: 'var(--bg)' }}>
            <video
              src={heroUrl + '#t=0.1'}
              controls
              preload="metadata"
              playsInline
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>
      )}

      {/* Title/meta when there's no hero image (video or no media) */}
      {!hasHeroImage && (
        <>
          {title && <h1 className="post-title"><HashtagText text={title} /></h1>}
          {summary && <p className="post-summary"><HashtagText text={summary} /></p>}
          <div className="meta" style={{ marginBottom: 12 }}>
            <a href="#/" className="post-back">← Back</a>
            <span className="post-meta__sep">·</span>
            <span>{ts}</span>
          </div>
        </>
      )}

      <StatsBar ev={ev} interactive />

      <div style={{ margin: '24px 0', borderTop: '1px solid var(--border)' }} />

      <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />

      {/* Comments section */}
      <div style={{ margin: '40px 0 8px', borderTop: '1px solid var(--border)' }} />
      <h3 style={{ fontSize: 20, marginBottom: 16, color: 'var(--muted)' }}>Conversation</h3>
      <div ref={commentsRef} />

      {canEdit && (
        <div style={{ marginTop: 24 }}>
          <a className="btn" href={`#/edit/${ev.id}`}>Edit post</a>
        </div>
      )}
    </article>
  )
}
