// src/components/PostView.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { marked } from 'marked'
import StatsBar from './StatsBar'

function relaysFromEnv() {
  const s = (import.meta.env.VITE_RELAYS as string) || ''
  const arr = s.split(',').map(t => t.trim()).filter(Boolean)
  return arr.length ? arr : [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social'
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
  const ALLOWED_HOSTS = new Set<string>([
    'm.primal.net',
    'primal.net',
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
    try { const url = new URL(u); return isAllowedHost(url.hostname) && VIDEO_EXT_REGEX.test(url.pathname + url.search) } catch { return false }
  }
  function extractAllowedFrom(text: string): string[] {
    return (text.match(URL_REGEX) || []).filter(isAllowedImageUrl)
  }
  function extractAllowedVideosFrom(text: string): string[] {
    return (text.match(URL_REGEX) || []).filter(isAllowedVideoUrl)
  }

  function getHeroMedia(ev: any): { type?: 'video' | 'image'; url?: string; cameFromBody?: boolean } {
    if (!ev) return {}
    // prefer explicit tags first
    const tagKeysImage = new Set(['image','thumb','cover','banner'])
    const tagKeysVideo = new Set(['video','movie'])
    const firstTagVal = (keys: Set<string>) => (ev.tags || []).find((tt: string[]) => keys.has(tt[0]))?.[1]

    // 1) explicit video tag
    const tv = firstTagVal(tagKeysVideo)
    if (tv && isHttpUrl(tv) && isAllowedVideoUrl(tv)) return { type: 'video', url: tv, cameFromBody: false }

    // 2) explicit image tag
    const ti = firstTagVal(tagKeysImage)
    if (ti && isHttpUrl(ti) && isAllowedImageUrl(ti)) return { type: 'image', url: ti, cameFromBody: false }

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

    // 4) first allow-listed media in content (prefer video)
    const videoFromBody = extractAllowedVideosFrom(ev.content || '')[0]
    if (videoFromBody) return { type: 'video', url: videoFromBody, cameFromBody: true }
    const imageFromBody = extractAllowedFrom(ev.content || '')[0]
    if (imageFromBody) return { type: 'image', url: imageFromBody, cameFromBody: true }
    return {}
  }

  const { type: heroType, url: heroUrl, cameFromBody } = useMemo(() => getHeroMedia(ev), [ev])

  // -------- metadata ----------
  const title = useMemo(() => {
    if (!ev) return ''
    return ev.tags.find((t: string[]) => t[0] === 'title')?.[1]
      || (ev.content.split('\n')[0]?.replace(/^#\s*/, ''))
      || 'Untitled'
  }, [ev])

  const summary = useMemo(() => {
    if (!ev) return ''
    return ev.tags.find((t: string[]) => t[0] === 'summary')?.[1] || ''
  }, [ev])

  const ts = useMemo(
    () => ev ? dayjs((ev.created_at || 0) * 1000).format('YYYY-MM-DD HH:mm') : '',
    [ev]
  )

  // Replace standalone video URLs (raw, angle-bracket, markdown, or simple <a>) in markdown with <video> players
  function embedInlineVideos(md: string): string {
    const lines = md.split(/\n/)
    const out: string[] = []
    for (let line of lines) {
      const trimmed = line.trim()

      // Case A: raw URL on its own line
      const rawMatch = (trimmed.match(URL_REGEX) || [])[0]
      if (rawMatch && isAllowedVideoUrl(rawMatch) && trimmed === rawMatch) {
        out.push(`<video src="${rawMatch}" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>`)
        continue
      }

      // Case B: <https://...> autolink style on its own line
      const angleMatch = /^<\s*(https?:\/\/[^\s<>'"()]+)\s*>$/i.exec(trimmed)
      if (angleMatch && isAllowedVideoUrl(angleMatch[1])) {
        out.push(`<video src="${angleMatch[1]}" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>`)
        continue
      }

      // Case C: HTML anchor tag on its own line
      const aTagMatch = /^<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]*)<\/a>\s*$/i.exec(trimmed)
      if (aTagMatch && isAllowedVideoUrl(aTagMatch[1])) {
        // If the anchor text is the same URL or empty, treat as standalone
        const text = (aTagMatch[2] || '').trim()
        if (!text || text === aTagMatch[1]) {
          out.push(`<video src="${aTagMatch[1]}" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>`)
          continue
        }
      }

      // Case D: Markdown link on its own line: [text](url) — embed if text equals the URL or is empty
      const mdLinkMatch = /^\[([^\]]*)\]\((https?:\/\/[^)]+)\)\s*$/i.exec(trimmed)
      if (mdLinkMatch && isAllowedVideoUrl(mdLinkMatch[2])) {
        const text = (mdLinkMatch[1] || '').trim()
        if (!text || text === mdLinkMatch[2]) {
          out.push(`<video src="${mdLinkMatch[2]}" controls preload="metadata" playsinline style="max-width:100%;width:100%;border-radius:12px"></video>`)
          continue
        }
      }

      out.push(line)
    }
    return out.join('\n')
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
    const body = (cameFromBody && heroUrl) ? stripHeroOnce(raw, heroUrl).replace(/\s{2,}/g, ' ').trim() : raw
    return marked.parse(embedInlineVideos(body))
  }, [ev, heroUrl, cameFromBody])

  // -------- comments: ZapThreads (iife) for comments only; hide its counts; fallback to NoComment ----------
  const injected = useRef(false)

  useEffect(() => {
    if (!ev || !commentsRef.current) return
    if (injected.current && import.meta.env.DEV) return
    injected.current = true

    const container = commentsRef.current
    const relays = relaysFromEnv()
    const relaysJson = JSON.stringify(relays)

    const clean = () => { if (commentsRef.current) commentsRef.current.innerHTML = '' }

    const resolveAnchor = async () => {
      const { nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
      if (ev.kind === 30023) {
        const d = (ev.tags || []).find((t: string[]) => t[0] === 'd')?.[1] || ''
        if (d) return nip19.naddrEncode({ kind: ev.kind, pubkey: ev.pubkey, identifier: d })
      }
      return nip19.neventEncode({ id: ev.id, author: ev.pubkey, kind: ev.kind })
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
      commentsRef.current!.appendChild(s)
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

      const firstRelay = relays[0] || 'wss://relay.damus.io'
      const anchorRaw = await resolveAnchor() // **raw NIP-19** (no nostr: prefix)

      clean()
      const el = document.createElement('zap-threads') as any
      el.setAttribute('anchor', anchorRaw)
      el.setAttribute('relays', firstRelay)
      el.setAttribute('theme', 'auto')
      el.setAttribute('publisher', 'nip07')
      hideZapThreadsChrome(el)

      commentsRef.current!.appendChild(el)
      console.log('[comments] provider: zapthreads (<zap-threads>)')
      return true
    }

    const run = async () => {
      container.innerHTML = '<div class="meta">Loading comments…</div>'
      const ok = await mountZapThreads()
      if (!ok) await mountNoComment()
    }

    run()
    return () => { injected.current = false; clean() }
  }, [ev?.id])

  // -------- jump to comments when 💬 clicked on list ----------
  useEffect(() => {
    if (!commentsRef.current) return
    if (sessionStorage.getItem('goto_comments') === '1') {
      commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      sessionStorage.removeItem('goto_comments')
    }
  }, [commentsRef.current])

  if (loading) return <p>Loading…</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!ev) return <div className="card"><p className="meta">Post not found.</p></div>

  return (
    <article>
      {/* HERO (optional) 16:9 center crop */}
      {heroUrl && (
        <div
          style={{
            width: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              background: '#000',
            }}
          >
            {heroType === 'image' ? (
              <img
                src={heroUrl}
                alt=""
                loading="lazy"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                }}
              />
            ) : (
              <video
                src={heroUrl}
                controls
                preload="metadata"
                playsInline
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            )}
          </div>
        </div>
      )}

      <h2 className="post-title">{title}</h2>
      <div className="meta">
        {ts}{summary ? ` · ${summary}` : ''}
      </div>

      {/* your clickable actions */}
      <StatsBar ev={ev} interactive />

      <div className="post-body" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: html }} />

      {/* comments (ZapThreads with its counts hidden, or NoComment fallback) */}
      <div ref={commentsRef} style={{ marginTop: 16 }} />

      <p style={{ display:'flex', gap:10 }}>
        <a className="btn" href="#/">← Back</a>
        {canEdit && <a className="btn" href={`#/edit/${ev.id}`}>Edit</a>}
      </p>
    </article>
  )
}