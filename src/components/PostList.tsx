// src/components/PostList.tsx
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import RepostCard from './RepostCard'

type NEvent = {
  id: string
  kind: number
  pubkey: string
  content: string
  tags: string[][]
  created_at: number
}

/* -------------------- relays -------------------- */
function relaysFromEnv(): string[] {
  const raw = (import.meta.env.VITE_RELAYS as string) || ''
  const arr = raw.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length
    ? arr
    : [
        'wss://relay.primal.net',
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.snort.social',
      ]
}

/* -------------------- nip19 helpers -------------------- */
function npubToHex(npubOrHex: string, nip19: any): string {
  if (!npubOrHex) return ''
  if (/^[0-9a-f]{64}$/i.test(npubOrHex)) return npubOrHex
  try {
    const dec = nip19.decode(npubOrHex)
    if (dec?.type === 'npub') return dec.data as string
  } catch {}
  return ''
}

function isReply(ev: NEvent): boolean {
  if (ev.kind !== 1) return false
  const tags = ev.tags || []
  let hasThreadRef = false
  let hasMarker = false
  for (const t of tags) {
    if (!t || t.length === 0) continue
    if (t[0] === 'e' || t[0] === 'a') {
      hasThreadRef = true
      if (t[3] === 'reply' || t[3] === 'root') hasMarker = true
    }
  }
  if (hasMarker) return true
  return hasThreadRef
}

function getD(ev: NEvent): string | undefined { return ev.tags.find(t => t[0] === 'd')?.[1] }
function getTitle(ev: NEvent): string {
  const fromTag = ev.tags.find(t => t[0] === 'title')?.[1]
  if (fromTag) return fromTag
  const firstLine = (ev.content || '').split('\n')[0]?.trim()
  if (firstLine?.startsWith('#')) return firstLine.replace(/^#+\s*/, '')
  return 'Untitled'
}
function getSummary(ev: NEvent): string { return ev.tags.find(t => t[0] === 'summary')?.[1] || '' }

/* -------------------- short-note image allowlist -------------------- */
const IMG_HOST_ALLOW_SET = new Set<string>(['m.primal.net','primal.net','image.nostr.build','i.nostr.build','nostr.build','void.cat'])
function isAllowedHost(hostname: string): boolean {
  if (IMG_HOST_ALLOW_SET.has(hostname)) return true
  if (hostname.endsWith('.primal.net')) return true
  return false
}
const URL_REGEX = /https?:\/\/[^\s<>'"()]+/gi
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|avif)(?:\?.*)?$/i
const VIDEO_EXT_REGEX = /\.(?:mp4|webm|mov|m4v)(?:\?.*)?$/i
function isVideoUrl(u: string): boolean {
  try { const url = new URL(u); return VIDEO_EXT_REGEX.test(url.pathname + url.search) } catch { return false }
}
function extractVideoUrls(text: string): string[] {
  return (text.match(URL_REGEX) || []).filter(isVideoUrl)
}
function isAllowedImageUrl(u: string): boolean {
  try { const url = new URL(u); return isAllowedHost(url.hostname) && IMAGE_EXT_REGEX.test(url.pathname + url.search) } catch { return false }
}
function extractAllowedImageUrls(text: string): string[] { return (text.match(URL_REGEX) || []).filter(isAllowedImageUrl) }
function removeUrls(text: string, urls: string[]): string {
  let out = text
  for (const u of urls) {
    out = out.replace(u, '')
  }
  // collapse repeated spaces but keep line breaks
  out = out.replace(/[ ]{2,}/g, ' ')
  // trim trailing spaces on each line
  out = out.split('\n').map(l => l.trimEnd()).join('\n')
  return out.trim()
}

/* -------------------- HERO image helpers (longform) -------------------- */
function isHttpUrl(u: string): boolean { try { const url = new URL(u); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false } }
function getHeroImageUrl(ev: NEvent): string | undefined {
  const tagKeys = new Set(['image','thumb','cover','banner'])
  const tagCandidate = ev.tags.find(t => tagKeys.has(t[0]))?.[1]
  if (tagCandidate && isHttpUrl(tagCandidate)) return tagCandidate
  const imetas = ev.tags.filter(t => t[0] === 'imeta')
  for (const im of imetas) {
    for (const part of im.slice(1)) {
      const urlMatch = (part.match(URL_REGEX) || [])[0]
      if (urlMatch && isHttpUrl(urlMatch)) return urlMatch
      const mEq = /^url\s*=\s*(https?:\/\/\S+)$/i.exec(part); if (mEq && isHttpUrl(mEq[1])) return mEq[1]
      const mColon = /^url\s*:\s*(https?:\/\/\S+)$/i.exec(part); if (mColon && isHttpUrl(mColon[1])) return mColon[1]
      const mSpace = /^url\s+(https?:\/\/\S+)$/i.exec(part); if (mSpace && isHttpUrl(mSpace[1])) return mSpace[1]
    }
  }
  const fromBody = extractAllowedImageUrls(ev.content)[0]
  if (fromBody) return fromBody
  return undefined
}

/* -------------------- tag match helpers -------------------- */
function hasTag(ev: NEvent, slug: string): boolean {
  const want = (slug || '').toLowerCase()
  if (!want) return false
  // NIP-12 t-tags
  const tHit = ev.tags.some(t => t[0] === 't' && (t[1] || '').toLowerCase() === want)
  if (tHit) return true
  // hashtag fallback from body
  const bodyTags = (ev.content.match(/#[a-z0-9_-]+/gi) || []).map(h => h.slice(1).toLowerCase())
  return bodyTags.includes(want)
}

/* --- tag behavior: which tags include short notes on tag pages? --- */
const TAGS_INCLUDE_NOTES = new Set<string>(['cook','briantries','fitness','bitcoin'])

/* =================== Profile fetch (memoized + timeout + pool reuse) =================== */
let __pool: any = null
async function getPool() {
  if (__pool) return __pool
  const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
  __pool = new SimplePool()
  return __pool
}

const avatarPromiseCache = new Map<string, Promise<string | null>>()

function withTimeout<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('profile timeout')), ms)
    p.then(v => { clearTimeout(t); resolve(v) }).catch(e => { clearTimeout(t); reject(e) })
  })
}

async function fetchProfilePictureOnce(pubkey: string, relays: string[]): Promise<string | null> {
  try {
    const { SimplePool }: any = await import('https://esm.sh/nostr-tools@1.17.0')
    const pool = new SimplePool()
    const ev = await withTimeout(pool.get(relays, { kinds: [0], authors: [pubkey] }), 2000)
    // close sockets per run to avoid WS overload in long sessions
    try { pool.close(relays) } catch {}
    if (!ev?.content) return null
    try {
      const meta = JSON.parse(ev.content)
      const url = meta?.picture || meta?.image
      return (url && /^https?:\/\//.test(url)) ? url : null
    } catch { return null }
  } catch { return null }
}

function fetchProfilePictureCached(pubkey: string, relays: string[]): Promise<string | null> {
  const key = pubkey
  const cached = avatarPromiseCache.get(key)
  if (cached) return cached
  const p = fetchProfilePictureOnce(pubkey, relays)
  avatarPromiseCache.set(key, p)
  return p
}

/* ================================================================ */
const PAGE_SIZE = 10

export default function PostList({ tag, filterFn }: { tag?: string; filterFn?: (ev: NEvent) => boolean }) {
  const [items, setItems] = useState<NEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')
  const [page, setPage] = useState(0)

  const relays = useMemo(() => relaysFromEnv(), [])
  const authorNpub = (import.meta.env.VITE_NOSTR_AUTHOR as string) || ''

  // Reset page when tag/filter changes
  useEffect(() => { setPage(0) }, [tag, filterFn])

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        setLoading(true); setErr('')
        const { SimplePool, nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
        const authorHex = npubToHex(authorNpub, nip19)
        if (!authorHex) throw new Error('Bad VITE_NOSTR_AUTHOR')
        const pool = await getPool()

        const lowerTag = (tag || '').toLowerCase()
        const includeNotesForTag = !!lowerTag && TAGS_INCLUDE_NOTES.has(lowerTag)

        // Build relay filters
        const filters = tag ? (
          includeNotesForTag
            ? [{ kinds: [30023, 1], authors: [authorHex], limit: 200 }]
            : [{ kinds: [30023], authors: [authorHex], limit: 200 }]
        ) : [
          { kinds: [30023], authors: [authorHex], limit: 100 },
          { kinds: [1], authors: [authorHex], limit: 100 },
          { kinds: [6], authors: [authorHex], limit: 50 },
        ]

        const evs: NEvent[] = await pool.list(relays, filters)
        if (stop) return

        let filtered = evs
        if (tag) {
          // Tag pages
          if (includeNotesForTag) {
            filtered = evs.filter(ev => (
              (ev.kind === 30023 || (ev.kind === 1 && !isReply(ev))) && hasTag(ev, lowerTag)
            ))
          } else {
            filtered = evs.filter(ev => ev.kind === 30023 && hasTag(ev, lowerTag))
          }
        } else {
          // Home view
          if (filterFn) {
            filtered = evs.filter(filterFn)
          } else {
            filtered = evs.filter(ev => (
              ev.kind === 6 ||
              ev.kind === 30023 ||
              (ev.kind === 1 && !isReply(ev))
            ))
          }
        }

        filtered.sort((a,b) => (b.created_at||0) - (a.created_at||0))
        setItems(filtered)
      } catch (e:any) { if (!stop) setErr(e?.message || String(e)) }
      finally { if (!stop) setLoading(false) }
    })()
    return () => { stop = true }
  }, [authorNpub, relays, tag, filterFn])

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safeePage = Math.min(page, totalPages - 1)
  const pageItems = items.slice(safeePage * PAGE_SIZE, (safeePage + 1) * PAGE_SIZE)

  const goPage = (p: number) => {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</p>
  if (err) return <div className="card"><p className="meta">Error: {err}</p></div>
  if (!items.length) return <div className="card"><p className="meta">{tag ? `No posts yet for "${tag}".` : 'No posts yet.'}</p></div>

  return (
    <>
    <Lightbox />
    <ul className="list">
      {pageItems.map((ev, idx) => {
        const ts = dayjs(ev.created_at * 1000).format('MMM D, YYYY')

        /* ---- Repost card ---- */
        if (!tag && ev.kind === 6) {
          return (
            <li className="list-row" key={ev.id}>
              <div className="card card--repost">
                <div className="meta" style={{ marginBottom: 8, fontSize: 13, opacity: .7 }}>
                  <span>↻ reposted · {ts}</span>
                </div>
                <RepostCard ev={ev} />
              </div>
            </li>
          )
        }

        /* ---- Long-form article card ---- */
        if (ev.kind === 30023) {
          const title = getTitle(ev)
          const summary = getSummary(ev)
          const hero = getHeroImageUrl(ev)
          const postUrl = `#/post/${encodeAnchor(ev)}`
          const clearComments = () => sessionStorage.removeItem('goto_comments')
          const tTags = ev.tags.filter(t => t[0] === 't' && t[1]).map(t => t[1].toLowerCase())
          const isFirst = idx === 0 && !tag && safeePage === 0

          return (
            <li className="list-row" key={ev.id}>
              <a
                href={postUrl}
                onClick={clearComments}
                className={`card card--article${isFirst ? ' card--featured' : ''}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                {hero && (
                  <div className="card__hero" style={{ margin: '-28px -32px 20px', overflow: 'hidden', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
                    <div style={{ position:'relative', width:'100%', aspectRatio: isFirst ? '2 / 1' : '16 / 9', background:'var(--bg)' }}>
                      <img src={hero} alt="" loading="lazy" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center', display:'block', transition: 'transform .3s ease' }} />
                    </div>
                  </div>
                )}
                <div className="title" style={{ fontSize: isFirst ? 'clamp(26px, 3.5vw, 38px)' : undefined }}>{title}</div>
                {summary && <div style={{ color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>{summary}</div>}
                <div className="meta" style={{ marginBottom: 8 }}>
                  <span>{ts}</span>
                </div>
                {tTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {tTags.slice(0, 4).map(t => (
                      <span key={t} style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--tag-bg)',
                        color: 'var(--tag-fg)',
                        letterSpacing: '.03em',
                        textTransform: 'uppercase',
                      }}>{t}</span>
                    ))}
                  </div>
                )}
                <div className="card__readmore">
                  <span className="card__readmore-text">Full story</span>
                  <span className="card__readmore-arrow">→</span>
                </div>
              </a>
            </li>
          )
        }

        /* ---- Short note card ---- */
        if (ev.kind === 1) {
          const lowerTag = (tag || '').toLowerCase()
          if (tag) {
            if (!TAGS_INCLUDE_NOTES.has(lowerTag)) return null
            if (!hasTag(ev, lowerTag)) return null
            if (isReply(ev)) return null
          } else {
            if (isReply(ev)) return null
          }

          const vids = extractVideoUrls(ev.content)
          const imgs = extractAllowedImageUrls(ev.content)
          const body = removeUrls(removeUrls(ev.content, vids), imgs)
          const primalUrl = `https://primal.net/e/${encodeAnchor(ev)}`
          return (
            <li className="list-row" key={ev.id}>
              <div className="card card--note">
                <NoteHeader pubkey={ev.pubkey} relays={relays} ts={ts} />
                <div style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere', wordBreak:'break-word', marginTop: 12, lineHeight: 1.7 }}>{body}</div>
                {vids.length > 0 && (
                  <div style={{ marginTop: 14, display:'grid', gap: 10 }}>
                    {vids.map((u,i) => (
                      <video key={u+i} src={u} controls preload="metadata" playsInline style={{ maxWidth:'100%', width:'100%', borderRadius:12 }} />
                    ))}
                  </div>
                )}
                {imgs.length > 0 && <ImageGallery urls={imgs} />}
                <a
                  href={primalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primal-link"
                >
                  <img src="/primal-icon.png" alt="" className="primal-link__icon" />
                  view note →
                </a>
              </div>
            </li>
          )
        }

        return null
      })}
    </ul>
    {totalPages > 1 && (
      <Pagination page={safeePage} totalPages={totalPages} onPage={goPage} />
    )}
    </>
  )
}

/* =================== Pagination =================== */
function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  // Show a window of page numbers around the current page
  const maxButtons = 5
  let start = Math.max(0, page - Math.floor(maxButtons / 2))
  let end = Math.min(totalPages, start + maxButtons)
  if (end - start < maxButtons) start = Math.max(0, end - maxButtons)

  const pages: number[] = []
  for (let i = start; i < end; i++) pages.push(i)

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        className="pagination__btn"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        ← Newer
      </button>

      <div className="pagination__pages">
        {start > 0 && (
          <>
            <button className="pagination__num" onClick={() => onPage(0)}>1</button>
            {start > 1 && <span className="pagination__dots">...</span>}
          </>
        )}
        {pages.map(p => (
          <button
            key={p}
            className={`pagination__num${p === page ? ' pagination__num--active' : ''}`}
            onClick={() => onPage(p)}
          >
            {p + 1}
          </button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="pagination__dots">...</span>}
            <button className="pagination__num" onClick={() => onPage(totalPages - 1)}>{totalPages}</button>
          </>
        )}
      </div>

      <button
        className="pagination__btn"
        disabled={page >= totalPages - 1}
        onClick={() => onPage(page + 1)}
      >
        Older →
      </button>
    </nav>
  )
}

/* ---------- helpers ---------- */
function encodeAnchor(ev: NEvent): string { return encodeNip19(ev, ev.kind) }
function encodeNip19(ev: NEvent, kind: number): string {
  const enc = (window as any).__nip19enc as (x: any) => string | null
  if (enc) return enc({ ev, kind }) || ev.id
  ;(async () => {
    const { nip19 }: any = await import('https://esm.sh/nostr-tools@1.17.0')
    ;(window as any).__nip19enc = ({ ev, kind }: any) => {
      try {
        if (kind === 30023) {
          const d = getD(ev)
          if (d) return nip19.naddrEncode({ kind, pubkey: ev.pubkey, identifier: d })
        }
        return nip19.neventEncode({ id: ev.id, kind: ev.kind, author: ev.pubkey })
      } catch { return null }
    }
  })()
  return ev.id
}

/* =================== Note Header (avatar + timestamp, clean inline) =================== */
function NoteHeader({ pubkey, relays, ts }: { pubkey: string; relays: string[]; ts: string }) {
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let stop = false
    setAvatar(undefined)
    ;(async () => {
      const url = await fetchProfilePictureCached(pubkey, relays)
      if (!stop) setAvatar(url)
    })()
    return () => { stop = true }
  }, [pubkey, relays.join(',')])

  const size = 36

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {avatar === undefined ? (
        <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
      ) : avatar ? (
        <img src={avatar} alt="" loading="lazy" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0, border: '1px solid var(--border)' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--border)', fontWeight: 600, fontSize: 11, flexShrink: 0, color: 'var(--muted)' }}>
          {(pubkey || '').slice(0, 4).toUpperCase()}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{ts} · short note</span>
      </div>
    </div>
  )
}

/* =================== Lightbox state (shared across all galleries) =================== */
let __lightboxSet: ((s: { urls: string[]; idx: number } | null) => void) | null = null

function Lightbox() {
  const [state, setState] = useState<{ urls: string[]; idx: number } | null>(null)
  __lightboxSet = setState

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null)
      if (e.key === 'ArrowRight') setState(s => s ? { ...s, idx: Math.min(s.idx + 1, s.urls.length - 1) } : null)
      if (e.key === 'ArrowLeft') setState(s => s ? { ...s, idx: Math.max(s.idx - 1, 0) } : null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [state])

  if (!state) return null
  const { urls, idx } = state
  const hasNext = idx < urls.length - 1
  const hasPrev = idx > 0

  return createPortal(
    <div className="lightbox" onClick={() => setState(null)}>
      <img
        key={urls[idx]}
        src={urls[idx]}
        alt=""
        className="lightbox__img"
        onClick={e => e.stopPropagation()}
      />
      {hasPrev && (
        <button className="lightbox__nav lightbox__nav--prev" onClick={e => { e.stopPropagation(); setState({ urls, idx: idx - 1 }) }} aria-label="Previous">
          ‹
        </button>
      )}
      {hasNext && (
        <button className="lightbox__nav lightbox__nav--next" onClick={e => { e.stopPropagation(); setState({ urls, idx: idx + 1 }) }} aria-label="Next">
          ›
        </button>
      )}
      <button className="lightbox__close" onClick={() => setState(null)} aria-label="Close">×</button>
      {urls.length > 1 && (
        <div className="lightbox__counter">{idx + 1} / {urls.length}</div>
      )}
    </div>,
    document.body
  )
}

/* =================== Image Gallery (adaptive grid) =================== */
function ImageGallery({ urls }: { urls: string[] }) {
  if (!urls.length) return null
  const maxShow = 4
  const show = urls.slice(0, maxShow)
  const extra = urls.length - maxShow

  let layoutClass = 'img-gallery'
  if (show.length === 1) layoutClass += ' img-gallery--1'
  else if (show.length === 2) layoutClass += ' img-gallery--2'
  else if (show.length === 3) layoutClass += ' img-gallery--3'
  else layoutClass += ' img-gallery--grid'

  const open = (i: number) => {
    if (__lightboxSet) __lightboxSet({ urls, idx: i })
  }

  return (
    <div className={layoutClass}>
      {show.map((u, i) => (
        <a
          key={u + i}
          href={u}
          onClick={e => { e.preventDefault(); open(i) }}
          style={{ cursor: 'zoom-in' }}
        >
          <img src={u} alt="" loading="lazy" />
          {i === show.length - 1 && extra > 0 && (
            <div className="gallery-more">+{extra}</div>
          )}
        </a>
      ))}
    </div>
  )
}